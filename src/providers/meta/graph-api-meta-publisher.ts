import {
  InMemoryMetaCredentialsProvider,
  SocialAccountCredentialsProvider,
  type MetaCredentials,
  type MetaCredentialsProvider,
} from "@/providers/meta/credentials";
import { DryRunMetaPublisher } from "@/providers/meta/dry-run-meta-publisher";
import { isMetaPublishingEnabled } from "@/providers/meta/feature-flags";
import { mapMetaError } from "@/providers/meta/meta-errors";
import {
  createMetaGraphClient,
  type MetaGraphClient,
} from "@/providers/meta/meta-graph-client";
import {
  MetaPublishError,
  type MetaPublisher,
  type PublishRequest,
  type PublishResult,
  publishRequestSchema,
} from "@/providers/meta/types";
import { logger } from "@/lib/logging/logger";
import { assertPublicHttpUrl } from "@/lib/security/ssrf";

export type GraphApiMetaPublisherDeps = {
  credentials?: MetaCredentialsProvider;
  client?: MetaGraphClient;
  /**
   * Test-only: exercise Graph upload path with a mocked client/fetch.
   * Never set in production code paths.
   */
  forceGraphPath?: boolean;
  pollIntervalMs?: number;
  pollTimeoutMs?: number;
};

type ContainerStatus = {
  status_code?: string;
  id?: string;
  status?: string;
};

/**
 * Graph API publisher. Real HTTP only when feature flags allow, or when
 * `forceGraphPath` is set for unit tests with a mocked client.
 */
export class GraphApiMetaPublisher implements MetaPublisher {
  private readonly dryRun = new DryRunMetaPublisher();
  private readonly credentials: MetaCredentialsProvider;
  private readonly client: MetaGraphClient;
  private readonly forceGraphPath: boolean;
  private readonly pollIntervalMs: number;
  private readonly pollTimeoutMs: number;
  private readonly publishedKeys = new Map<string, PublishResult>();

  constructor(deps: GraphApiMetaPublisherDeps = {}) {
    this.credentials =
      deps.credentials ?? new SocialAccountCredentialsProvider();
    this.client = deps.client ?? createMetaGraphClient();
    this.forceGraphPath = deps.forceGraphPath === true;
    this.pollIntervalMs = deps.pollIntervalMs ?? 500;
    this.pollTimeoutMs = deps.pollTimeoutMs ?? 60_000;
  }

  private shouldUseDryRun(): boolean {
    if (this.forceGraphPath) return false;
    return !isMetaPublishingEnabled();
  }

  async validateAccount(accountId: string): Promise<void> {
    try {
      if (this.shouldUseDryRun()) {
        await this.dryRun.validateAccount(accountId);
        return;
      }
      await this.validateToken(accountId);
      await this.validateConnectedAccount(accountId);
    } catch (error) {
      throw mapMetaError(error);
    }
  }

  async publish(request: PublishRequest): Promise<PublishResult> {
    const parsed = publishRequestSchema.parse(request);

    logger.info("meta.publish.start", {
      platform: parsed.platform,
      postType: parsed.postType,
      publicationId: parsed.publicationId,
      contentDraftId: parsed.contentDraftId,
      idempotencyKey: parsed.idempotencyKey,
      mediaCount: parsed.mediaUrls.length,
      accountId: parsed.accountId,
    });

    try {
      const existing = this.publishedKeys.get(parsed.idempotencyKey);
      if (existing) return existing;

      await this.validateAccount(parsed.accountId);

      if (this.shouldUseDryRun()) {
        const dry = await this.dryRun.publish(parsed);
        this.publishedKeys.set(parsed.idempotencyKey, dry);
        return dry;
      }

      const result =
        parsed.postType === "CAROUSEL"
          ? await this.uploadCarousel(parsed)
          : await this.uploadImage(parsed);

      this.publishedKeys.set(parsed.idempotencyKey, result);
      return result;
    } catch (error) {
      const mapped = mapMetaError(error);
      logger.error("meta.publish.failed", {
        publicationId: parsed.publicationId,
        contentDraftId: parsed.contentDraftId,
        idempotencyKey: parsed.idempotencyKey,
        code: mapped.code,
        message: mapped.message,
      });
      throw mapped;
    }
  }

  private async validateToken(accountId: string): Promise<void> {
    if (accountId === "expired") {
      throw new MetaPublishError("TOKEN_PERMANENTLY_INVALID");
    }
    const creds = await this.credentials.getCredentials(accountId);
    await this.client.request({
      path: "me",
      method: "GET",
      query: { fields: "id,name" },
      accessToken: creds.accessToken,
    });
  }

  private async validateConnectedAccount(accountId: string): Promise<void> {
    if (!accountId?.trim() || accountId === "disconnected") {
      throw new MetaPublishError("ACCOUNT_DISCONNECTED");
    }
    await this.credentials.getCredentials(accountId);
  }

  private async uploadImage(request: PublishRequest): Promise<PublishResult> {
    for (const url of request.mediaUrls) {
      assertPublicHttpUrl(url);
    }
    const creds = await this.credentials.getCredentials(request.accountId);
    if (request.platform === "FACEBOOK") {
      return this.publishFacebookPhoto(request, creds);
    }
    return this.publishInstagramSingle(request, creds);
  }

  private async uploadCarousel(request: PublishRequest): Promise<PublishResult> {
    for (const url of request.mediaUrls) {
      assertPublicHttpUrl(url);
    }
    const creds = await this.credentials.getCredentials(request.accountId);
    if (request.platform === "FACEBOOK") {
      return this.publishFacebookCarousel(request, creds);
    }
    return this.publishInstagramCarousel(request, creds);
  }

  private async publishFacebookPhoto(
    request: PublishRequest,
    creds: MetaCredentials,
  ): Promise<PublishResult> {
    const data = await this.client.request<{ id?: string; post_id?: string }>({
      path: `${creds.externalId}/photos`,
      method: "POST",
      query: {
        url: request.mediaUrls[0],
        caption: request.caption,
        published: true,
      },
      accessToken: creds.accessToken,
    });
    const id = data.post_id ?? data.id;
    if (!id) {
      throw new MetaPublishError("UNKNOWN", "Facebook photo publish missing id");
    }
    return {
      dryRun: false,
      externalPostId: id,
      externalPostUrl: `https://www.facebook.com/${id}`,
    };
  }

  private async publishFacebookCarousel(
    request: PublishRequest,
    creds: MetaCredentials,
  ): Promise<PublishResult> {
    const attached: Array<{ media_fbid: string }> = [];
    for (const url of request.mediaUrls) {
      const uploaded = await this.client.request<{ id: string }>({
        path: `${creds.externalId}/photos`,
        method: "POST",
        query: { url, published: false },
        accessToken: creds.accessToken,
      });
      if (!uploaded.id) {
        throw new MetaPublishError("FILE_NOT_ACCESSIBLE", "Photo upload failed");
      }
      attached.push({ media_fbid: uploaded.id });
    }

    const feed = await this.client.request<{ id: string }>({
      path: `${creds.externalId}/feed`,
      method: "POST",
      body: {
        message: request.caption,
        attached_media: attached,
      },
      accessToken: creds.accessToken,
    });
    if (!feed.id) {
      throw new MetaPublishError("UNKNOWN", "Facebook feed publish missing id");
    }
    return {
      dryRun: false,
      externalPostId: feed.id,
      externalPostUrl: `https://www.facebook.com/${feed.id}`,
    };
  }

  private async publishInstagramSingle(
    request: PublishRequest,
    creds: MetaCredentials,
  ): Promise<PublishResult> {
    const container = await this.client.request<{ id: string }>({
      path: `${creds.externalId}/media`,
      method: "POST",
      query: {
        image_url: request.mediaUrls[0],
        caption: request.caption,
      },
      accessToken: creds.accessToken,
    });
    if (!container.id) {
      throw new MetaPublishError("UNKNOWN", "IG media container missing id");
    }
    await this.pollContainer(container.id, creds.accessToken);
    return this.publishInstagramContainer(container.id, creds);
  }

  private async publishInstagramCarousel(
    request: PublishRequest,
    creds: MetaCredentials,
  ): Promise<PublishResult> {
    const children: string[] = [];
    for (const url of request.mediaUrls) {
      const child = await this.client.request<{ id: string }>({
        path: `${creds.externalId}/media`,
        method: "POST",
        query: {
          image_url: url,
          is_carousel_item: true,
        },
        accessToken: creds.accessToken,
      });
      if (!child.id) {
        throw new MetaPublishError("UNKNOWN", "IG carousel child missing id");
      }
      await this.pollContainer(child.id, creds.accessToken);
      children.push(child.id);
    }

    const parent = await this.client.request<{ id: string }>({
      path: `${creds.externalId}/media`,
      method: "POST",
      query: {
        media_type: "CAROUSEL",
        children: children.join(","),
        caption: request.caption,
      },
      accessToken: creds.accessToken,
    });
    if (!parent.id) {
      throw new MetaPublishError("UNKNOWN", "IG carousel parent missing id");
    }
    await this.pollContainer(parent.id, creds.accessToken);
    return this.publishInstagramContainer(parent.id, creds);
  }

  private async publishInstagramContainer(
    creationId: string,
    creds: MetaCredentials,
  ): Promise<PublishResult> {
    const published = await this.client.request<{ id: string }>({
      path: `${creds.externalId}/media_publish`,
      method: "POST",
      query: { creation_id: creationId },
      accessToken: creds.accessToken,
    });
    if (!published.id) {
      throw new MetaPublishError("UNKNOWN", "IG media_publish missing id");
    }
    return {
      dryRun: false,
      externalPostId: published.id,
      externalPostUrl: `https://www.instagram.com/p/${published.id}/`,
    };
  }

  private async pollContainer(
    containerId: string,
    accessToken: string,
  ): Promise<void> {
    const deadline = Date.now() + this.pollTimeoutMs;
    while (Date.now() < deadline) {
      const status = await this.client.request<ContainerStatus>({
        path: containerId,
        method: "GET",
        query: { fields: "status_code,status" },
        accessToken,
      });
      const code = (status.status_code ?? status.status ?? "").toUpperCase();
      if (code === "FINISHED" || code === "PUBLISHED") return;
      if (code === "ERROR" || code === "EXPIRED") {
        throw new MetaPublishError(
          "VALIDATION_REJECTED",
          `IG container status ${code}`,
        );
      }
      await sleep(this.pollIntervalMs);
    }
    throw new MetaPublishError("TIMEOUT", "IG container polling timed out");
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export {
  InMemoryMetaCredentialsProvider,
  SocialAccountCredentialsProvider,
};
