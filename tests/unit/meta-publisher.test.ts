import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createMetaPublisher,
  DryRunMetaPublisher,
  GraphApiMetaPublisher,
  mapMetaError,
  publishRequestSchema,
  type PublishRequest,
} from "@/providers/meta";
import { publishScheduledPost } from "@/features/publishing/publish-scheduled";
import { PublishGateError } from "@/features/publishing/publish-gates";
import { getInMemoryContentDraftRepository } from "@/server/repositories/content-draft-repository";
import {
  InMemoryPublicationStore,
  SocialPostScheduler,
} from "@/providers/scheduler/social-post-scheduler";
import { sanitizeForLogs } from "@/lib/logging/logger";

function baseRequest(
  overrides: Partial<PublishRequest> = {},
): PublishRequest {
  return publishRequestSchema.parse({
    platform: "FACEBOOK",
    postType: "POSTER",
    caption: "Hello",
    mediaUrls: ["https://cdn.example.com/poster.png"],
    mimeTypes: ["image/png"],
    contentDraftId: "draft_1",
    publicationId: "pub_1",
    idempotencyKey: "key-1",
    accountId: "acc-1",
    ...overrides,
  });
}

describe("MetaPublisher DRY_RUN", () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    process.env.DRY_RUN = "true";
    delete process.env.META_PUBLISH_ENABLED;
    getInMemoryContentDraftRepository().reset();
    fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response("ok"));
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it("publishes Facebook image in DRY_RUN without fetch", async () => {
    const publisher = new DryRunMetaPublisher();
    const result = await publisher.publish(
      baseRequest({
        platform: "FACEBOOK",
        idempotencyKey: "fb-image",
        publicationId: "pub_fb",
      }),
    );

    expect(result).toEqual({
      dryRun: true,
      externalPostId: "dryrun_fb-image",
      externalPostUrl: "https://dry-run.local/posts/fb-image",
    });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("publishes Instagram image in DRY_RUN without fetch", async () => {
    const publisher = new DryRunMetaPublisher();
    const result = await publisher.publish(
      baseRequest({
        platform: "INSTAGRAM",
        idempotencyKey: "ig-image",
        publicationId: "pub_ig",
      }),
    );

    expect(result.externalPostId).toBe("dryrun_ig-image");
    expect(result.dryRun).toBe(true);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("publishes carousel DRY_RUN with at least two URLs", async () => {
    const publisher = new DryRunMetaPublisher();
    const result = await publisher.publish(
      baseRequest({
        platform: "INSTAGRAM",
        postType: "CAROUSEL",
        mediaUrls: [
          "https://cdn.example.com/1.png",
          "https://cdn.example.com/2.jpg",
        ],
        mimeTypes: ["image/png", "image/jpeg"],
        idempotencyKey: "carousel-1",
      }),
    );

    expect(result.externalPostId).toBe("dryrun_carousel-1");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("rejects schema violations with z.strict()", () => {
    expect(() =>
      publishRequestSchema.parse({
        ...baseRequest(),
        extraField: "nope",
      }),
    ).toThrow();

    expect(() =>
      publishRequestSchema.parse({
        ...baseRequest({ postType: "CAROUSEL", mediaUrls: ["https://cdn.example.com/a.png"], mimeTypes: ["image/png"] }),
      }),
    ).toThrow();
  });

  it("rejects inaccessible and localhost assets", async () => {
    const publisher = new DryRunMetaPublisher();

    await expect(
      publisher.publish(
        baseRequest({
          mediaUrls: ["https://cdn.example.com/inaccessible.png"],
          idempotencyKey: "bad-file",
        }),
      ),
    ).rejects.toMatchObject({ code: "FILE_NOT_ACCESSIBLE" });

    await expect(
      publisher.publish(
        baseRequest({
          mediaUrls: ["http://localhost:3000/asset.png"],
          idempotencyKey: "local-file",
        }),
      ),
    ).rejects.toMatchObject({ code: "FILE_NOT_ACCESSIBLE" });

    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("is idempotent for the same key (never two Meta posts)", async () => {
    const publisher = new DryRunMetaPublisher();
    const first = await publisher.publish(
      baseRequest({ idempotencyKey: "same-key" }),
    );
    const second = await publisher.publish(
      baseRequest({
        idempotencyKey: "same-key",
        caption: "Changed",
        platform: "INSTAGRAM",
      }),
    );
    expect(second).toEqual(first);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("rejects invalid token and disconnected account", async () => {
    const publisher = new DryRunMetaPublisher();

    await expect(publisher.validateAccount("disconnected")).rejects.toMatchObject({
      code: "ACCOUNT_DISCONNECTED",
    });
    await expect(publisher.validateAccount("expired")).rejects.toMatchObject({
      code: "TOKEN_PERMANENTLY_INVALID",
    });

    await expect(
      publisher.publish(baseRequest({ accountId: "expired", idempotencyKey: "tok" })),
    ).rejects.toMatchObject({ code: "TOKEN_PERMANENTLY_INVALID" });

    await expect(
      publisher.publish(
        baseRequest({ accountId: "disconnected", idempotencyKey: "disc" }),
      ),
    ).rejects.toMatchObject({ code: "ACCOUNT_DISCONNECTED" });

    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("uses mocked real GraphApiMetaPublisher without network", async () => {
    const publisher = new GraphApiMetaPublisher();
    const result = await publisher.publish(
      baseRequest({ idempotencyKey: "graph-mock" }),
    );
    expect(result.dryRun).toBe(true);
    expect(createMetaPublisher()).toBeInstanceOf(DryRunMetaPublisher);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("factory stays on DryRun under Vitest even if publish flags are on", () => {
    process.env.ENABLE_META_PUBLISHING = "true";
    process.env.META_PUBLISH_ENABLED = "true";
    process.env.DRY_RUN = "false";
    expect(createMetaPublisher()).toBeInstanceOf(DryRunMetaPublisher);
  });

  it("maps Meta Graph errors without leaking secrets", () => {
    const mapped = mapMetaError({
      error: {
        code: 190,
        message: "Invalid OAuth access token: Bearer secret.token.value",
      },
    });
    expect(mapped.code).toBe("TOKEN_PERMANENTLY_INVALID");
    expect(mapped.message).not.toContain("secret.token.value");
    expect(mapped.message).toContain("[REDACTED]");

    const sanitized = sanitizeForLogs({
      access_token: "EAAB...",
      authorization: "Bearer abc.def",
    }) as Record<string, unknown>;
    expect(sanitized.access_token).toBe("[REDACTED]");
    expect(sanitized.authorization).toBe("[REDACTED]");
  });

  it("refuses non-APPROVED content via publishScheduledPost", async () => {
    const drafts = getInMemoryContentDraftRepository();
    const draft = await drafts.create({
      brandId: "b1",
      templateId: "t1",
      type: "POSTER",
      topic: "Topic",
      objective: "Obj",
      language: "fr",
      status: "DRAFT",
    });

    await expect(
      publishScheduledPost(
        {
          id: "pub-1",
          contentDraftId: draft.id,
          platform: "FACEBOOK",
          socialAccountId: "acc-1",
          status: "SCHEDULED",
          scheduledAt: new Date(),
          timezone: "UTC",
          retryCount: 0,
          idempotencyKey: "gate-1",
        },
        { mediaUrls: ["https://cdn.example.com/a.png"] },
      ),
    ).rejects.toBeInstanceOf(PublishGateError);

    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("rejects missing assets", async () => {
    const drafts = getInMemoryContentDraftRepository();
    const draft = await drafts.create({
      brandId: "b1",
      templateId: "t1",
      type: "POSTER",
      topic: "Topic",
      objective: "Obj",
      language: "fr",
      status: "APPROVED",
    });

    await expect(
      publishScheduledPost(
        {
          id: "pub-missing",
          contentDraftId: draft.id,
          platform: "FACEBOOK",
          socialAccountId: "acc-1",
          status: "SCHEDULED",
          scheduledAt: new Date(),
          timezone: "UTC",
          retryCount: 0,
          idempotencyKey: "missing-asset",
        },
        { mediaUrls: [] },
      ),
    ).rejects.toMatchObject({ code: "FILE_NOT_ACCESSIBLE" });
  });

  it("persists external ids on success and failure fields on permanent error", async () => {
    const drafts = getInMemoryContentDraftRepository();
    const okDraft = await drafts.create({
      brandId: "b1",
      templateId: "t1",
      type: "POSTER",
      topic: "Topic",
      objective: "Obj",
      language: "fr",
      status: "APPROVED",
      generatedContent: { caption: "Live caption" },
    });

    const store = new InMemoryPublicationStore([
      {
        id: "p-persist",
        contentDraftId: okDraft.id,
        platform: "FACEBOOK",
        socialAccountId: "acc-1",
        status: "SCHEDULED",
        scheduledAt: new Date(Date.now() - 1000),
        timezone: "UTC",
        retryCount: 0,
        idempotencyKey: "persist-1",
      },
    ]);

    const scheduler = new SocialPostScheduler(
      store,
      "worker-meta",
      async (pub) =>
        publishScheduledPost(pub, {
          mediaUrls: ["https://cdn.example.com/poster.png"],
        }),
    );

    expect((await scheduler.tick()).processed).toBe(1);
    const published = store.getAll()[0]!;
    expect(published.status).toBe("PUBLISHED");
    expect(published.externalPostId).toBe("dryrun_persist-1");
    expect(published.externalPostUrl).toBe(
      "https://dry-run.local/posts/persist-1",
    );
    expect(published.publishedAt).toBeTruthy();

    const failDraft = await drafts.create({
      brandId: "b1",
      templateId: "t1",
      type: "POSTER",
      topic: "Topic",
      objective: "Obj",
      language: "fr",
      status: "APPROVED",
    });
    store.seed([
      {
        id: "p-fail",
        contentDraftId: failDraft.id,
        platform: "FACEBOOK",
        socialAccountId: "disconnected",
        status: "SCHEDULED",
        scheduledAt: new Date(Date.now() - 1000),
        timezone: "UTC",
        retryCount: 0,
        idempotencyKey: "fail-1",
      },
    ]);

    const failScheduler = new SocialPostScheduler(
      store,
      "worker-meta",
      async (pub) =>
        publishScheduledPost(pub, {
          mediaUrls: ["https://cdn.example.com/poster.png"],
        }),
    );
    expect((await failScheduler.tick()).failed).toBe(1);
    const failed = store.getAll()[0]!;
    expect(failed.status).toBe("FAILED");
    expect(failed.lastError).toBe("ACCOUNT_DISCONNECTED");
    expect(failed.retryCount).toBe(1);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("treats already-published idempotency as a single Meta post across scheduler retries", async () => {
    const drafts = getInMemoryContentDraftRepository();
    const draft = await drafts.create({
      brandId: "b1",
      templateId: "t1",
      type: "POSTER",
      topic: "Topic",
      objective: "Obj",
      language: "fr",
      status: "APPROVED",
    });

    const publisher = new DryRunMetaPublisher();
    const first = await publisher.publish(
      baseRequest({
        contentDraftId: draft.id,
        publicationId: "p-retry",
        idempotencyKey: "already-done",
      }),
    );

    const store = new InMemoryPublicationStore([
      {
        id: "p-retry",
        contentDraftId: draft.id,
        platform: "FACEBOOK",
        socialAccountId: "acc-1",
        status: "SCHEDULED",
        scheduledAt: new Date(Date.now() - 1000),
        timezone: "UTC",
        retryCount: 0,
        idempotencyKey: "already-done",
      },
    ]);

    const scheduler = new SocialPostScheduler(
      store,
      "worker-meta",
      async (pub) =>
        publishScheduledPost(pub, {
          mediaUrls: ["https://cdn.example.com/poster.png"],
          publisher,
        }),
    );

    await scheduler.tick();
    const published = store.getAll()[0]!;
    expect(published.externalPostId).toBe(first.externalPostId);
    expect(published.status).toBe("PUBLISHED");

    // Already PUBLISHED — not claimed again
    expect((await scheduler.tick()).processed).toBe(0);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
