import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  GraphApiMetaPublisher,
  InMemoryMetaCredentialsProvider,
  createMetaPublisher,
  DryRunMetaPublisher,
  FetchMetaGraphClient,
  publishRequestSchema,
  type PublishRequest,
} from "@/providers/meta";

function baseRequest(overrides: Partial<PublishRequest> = {}): PublishRequest {
  return publishRequestSchema.parse({
    platform: "FACEBOOK",
    postType: "POSTER",
    caption: "Hello",
    mediaUrls: ["https://cdn.example.com/poster.png"],
    mimeTypes: ["image/png"],
    contentDraftId: "draft_1",
    publicationId: "pub_1",
    idempotencyKey: "key-1",
    accountId: "sa_1",
    ...overrides,
  });
}

describe("GraphApiMetaPublisher real path (mocked fetch)", () => {
  let fetchSpy: ReturnType<typeof vi.fn>;
  let credentials: InMemoryMetaCredentialsProvider;

  beforeEach(() => {
    process.env.ENCRYPTION_KEY = "12345678901234567890123456789012";
    credentials = new InMemoryMetaCredentialsProvider();
    credentials.seed({
      accountId: "sa_1",
      platform: "FACEBOOK",
      externalId: "page_1",
      accessToken: "EAAB_test_token",
      displayName: "Test Page",
    });
    credentials.seed({
      accountId: "sa_ig",
      platform: "INSTAGRAM",
      externalId: "ig_1",
      accessToken: "EAAB_ig_token",
      displayName: "Test IG",
    });

    fetchSpy = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      expect(url).not.toMatch(/EAAB_test_token|EAAB_ig_token/);

      if (url.includes("/me?")) {
        return Response.json({ id: "me", name: "Page" });
      }
      if (url.includes("/photos") && url.includes("published=false")) {
        return Response.json({ id: "photo_child_1" });
      }
      if (url.includes("/photos")) {
        return Response.json({ id: "photo_1", post_id: "fb_post_1" });
      }
      if (url.includes("/feed")) {
        return Response.json({ id: "fb_feed_1" });
      }
      if (url.includes("/media_publish")) {
        return Response.json({ id: "ig_pub_1" });
      }
      if (url.includes("/media")) {
        return Response.json({ id: "ig_container_1" });
      }
      if (url.includes("fields=status_code")) {
        return Response.json({ status_code: "FINISHED" });
      }
      return Response.json({ error: { code: 100, message: "unexpected" } }, {
        status: 400,
      });
    });
  });

  afterEach(() => {
    fetchSpy.mockReset();
  });

  it("publishes Facebook image via Graph with mocked fetch", async () => {
    const publisher = new GraphApiMetaPublisher({
      forceGraphPath: true,
      credentials,
      client: new FetchMetaGraphClient(fetchSpy as unknown as typeof fetch),
    });

    const result = await publisher.publish(
      baseRequest({ idempotencyKey: "fb-real" }),
    );
    expect(result.dryRun).toBe(false);
    expect(result.externalPostId).toBe("fb_post_1");
    expect(fetchSpy).toHaveBeenCalled();
  });

  it("publishes Instagram image with container poll", async () => {
    const publisher = new GraphApiMetaPublisher({
      forceGraphPath: true,
      credentials,
      client: new FetchMetaGraphClient(fetchSpy as unknown as typeof fetch),
      pollIntervalMs: 1,
    });

    const result = await publisher.publish(
      baseRequest({
        platform: "INSTAGRAM",
        accountId: "sa_ig",
        idempotencyKey: "ig-real",
      }),
    );
    expect(result.dryRun).toBe(false);
    expect(result.externalPostId).toBe("ig_pub_1");
  });

  it("publishes Instagram carousel", async () => {
    const publisher = new GraphApiMetaPublisher({
      forceGraphPath: true,
      credentials,
      client: new FetchMetaGraphClient(fetchSpy as unknown as typeof fetch),
      pollIntervalMs: 1,
    });

    const result = await publisher.publish(
      baseRequest({
        platform: "INSTAGRAM",
        accountId: "sa_ig",
        postType: "CAROUSEL",
        mediaUrls: [
          "https://cdn.example.com/1.png",
          "https://cdn.example.com/2.png",
        ],
        mimeTypes: ["image/png", "image/png"],
        idempotencyKey: "ig-carousel",
      }),
    );
    expect(result.externalPostId).toBe("ig_pub_1");
  });

  it("maps token errors from Graph", async () => {
    fetchSpy.mockImplementation(async () =>
      Response.json(
        {
          error: {
            code: 190,
            message: "Invalid OAuth access_token=EAAB_secret",
          },
        },
        { status: 400 },
      ),
    );
    const publisher = new GraphApiMetaPublisher({
      forceGraphPath: true,
      credentials,
      client: new FetchMetaGraphClient(fetchSpy as unknown as typeof fetch),
    });

    await expect(
      publisher.publish(baseRequest({ idempotencyKey: "tok-err" })),
    ).rejects.toMatchObject({ code: "TOKEN_PERMANENTLY_INVALID" });
  });

  it("rejects disconnected credentials", async () => {
    const publisher = new GraphApiMetaPublisher({
      forceGraphPath: true,
      credentials,
      client: new FetchMetaGraphClient(fetchSpy as unknown as typeof fetch),
    });
    await expect(
      publisher.publish(
        baseRequest({ accountId: "disconnected", idempotencyKey: "disc" }),
      ),
    ).rejects.toMatchObject({ code: "ACCOUNT_DISCONNECTED" });
  });

  it("times out Graph requests", async () => {
    const client = new FetchMetaGraphClient(((_url, init) => {
      return new Promise((_resolve, reject) => {
        const signal = init?.signal;
        if (signal?.aborted) {
          reject(Object.assign(new Error("Aborted"), { name: "AbortError" }));
          return;
        }
        signal?.addEventListener("abort", () => {
          reject(Object.assign(new Error("Aborted"), { name: "AbortError" }));
        });
      });
    }) as typeof fetch);

    await expect(
      client.request({
        path: "me",
        accessToken: "tok",
        timeoutMs: 20,
      }),
    ).rejects.toMatchObject({ code: "TIMEOUT" });
  });

  it("factory remains DryRun under Vitest with flags on", () => {
    process.env.ENABLE_META_PUBLISHING = "true";
    process.env.DRY_RUN = "false";
    expect(createMetaPublisher()).toBeInstanceOf(DryRunMetaPublisher);
  });

  it("is idempotent on Graph path", async () => {
    const publisher = new GraphApiMetaPublisher({
      forceGraphPath: true,
      credentials,
      client: new FetchMetaGraphClient(fetchSpy as unknown as typeof fetch),
    });
    const a = await publisher.publish(
      baseRequest({ idempotencyKey: "idem-graph" }),
    );
    const calls = fetchSpy.mock.calls.length;
    const b = await publisher.publish(
      baseRequest({ idempotencyKey: "idem-graph" }),
    );
    expect(b).toEqual(a);
    expect(fetchSpy.mock.calls.length).toBe(calls);
  });
});
