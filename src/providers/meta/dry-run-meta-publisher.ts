import {
  MetaPublishError,
  type MetaPublisher,
  type PublishRequest,
  type PublishResult,
  publishRequestSchema,
} from "@/providers/meta/types";
import { assertPublicHttpUrl, UrlSafetyError } from "@/lib/security/ssrf";

/**
 * Zero-HTTP Meta publisher for local/tests. Never calls fetch.
 * Returns the same PublishResult contract as GraphApiMetaPublisher.
 */
export class DryRunMetaPublisher implements MetaPublisher {
  private readonly publishedKeys = new Map<string, PublishResult>();

  async validateAccount(accountId: string): Promise<void> {
    if (!accountId?.trim() || accountId === "disconnected") {
      throw new MetaPublishError(
        "ACCOUNT_DISCONNECTED",
        "Social account is disconnected",
      );
    }
    if (accountId === "expired") {
      throw new MetaPublishError(
        "TOKEN_PERMANENTLY_INVALID",
        "Access token is permanently invalid",
      );
    }
  }

  async publish(request: PublishRequest): Promise<PublishResult> {
    const parsed = publishRequestSchema.parse(request);
    await this.validateAccount(parsed.accountId);

    const existing = this.publishedKeys.get(parsed.idempotencyKey);
    if (existing) return existing;

    this.assertMediaUrls(parsed);

    const result: PublishResult = {
      dryRun: true,
      externalPostId: `dryrun_${parsed.idempotencyKey}`,
      externalPostUrl: `https://dry-run.local/posts/${parsed.idempotencyKey}`,
    };
    this.publishedKeys.set(parsed.idempotencyKey, result);
    return result;
  }

  private assertMediaUrls(parsed: PublishRequest): void {
    for (const url of parsed.mediaUrls) {
      try {
        assertPublicHttpUrl(url);
      } catch (error) {
        if (error instanceof UrlSafetyError) {
          throw new MetaPublishError(error.code, error.message);
        }
        throw error;
      }
    }
  }
}
