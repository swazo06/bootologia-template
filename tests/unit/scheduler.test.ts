import { describe, expect, it } from "vitest";
import {
  formatInTimeZone,
  toUtcDate,
} from "@/lib/datetime/timezone";
import {
  InMemoryPublicationStore,
  isRetryableError,
  nextRetryAt,
  NON_RETRYABLE_ERRORS,
  SocialPostScheduler,
  type PublishAttemptLog,
} from "@/providers/scheduler/social-post-scheduler";
import { PublicationStoreError } from "@/server/repositories/publication-repository";
import {
  assertPublishGates,
  PublishGateError,
} from "@/features/publishing/publish-gates";

function duePub(overrides: Partial<{
  id: string;
  scheduledAt: Date;
  idempotencyKey: string;
  retryCount: number;
}> = {}) {
  return {
    id: overrides.id ?? "p1",
    contentDraftId: "d1",
    platform: "FACEBOOK" as const,
    socialAccountId: "acc",
    status: "SCHEDULED" as const,
    scheduledAt: overrides.scheduledAt ?? new Date(Date.now() - 5_000),
    timezone: "UTC",
    retryCount: overrides.retryCount ?? 0,
    idempotencyKey: overrides.idempotencyKey ?? "key-1",
  };
}

describe("scheduler", () => {
  it("stores dates in UTC and converts only for display", () => {
    const utc = toUtcDate("2026-08-08T12:00:00.000Z");
    expect(utc.toISOString()).toBe("2026-08-08T12:00:00.000Z");
    const paris = formatInTimeZone(utc, "Europe/Paris");
    expect(paris).toMatch(/^2026-08-08 1[4]:00$/);
  });

  it("claims a due publication and ignores future ones", async () => {
    const now = new Date("2026-08-08T12:00:00.000Z");
    const store = new InMemoryPublicationStore([
      duePub({
        id: "due",
        scheduledAt: new Date("2026-08-08T11:59:00.000Z"),
        idempotencyKey: "due-key",
      }),
      duePub({
        id: "future",
        scheduledAt: new Date("2026-08-08T12:30:00.000Z"),
        idempotencyKey: "future-key",
      }),
    ]);

    const claimed = await store.claimDue(now, "worker-a", 10);
    expect(claimed.map((c) => c.id)).toEqual(["due"]);
    expect(store.getAll().find((p) => p.id === "future")?.status).toBe(
      "SCHEDULED",
    );
    expect(store.getAll().find((p) => p.id === "future")?.lockedAt).toBeFalsy();
  });

  it("claims a due publication for only one concurrent worker", async () => {
    const store = new InMemoryPublicationStore([duePub({ idempotencyKey: "lock-1" })]);

    const [a, b] = await Promise.all([
      store.claimDue(new Date(), "worker-a", 10),
      store.claimDue(new Date(), "worker-b", 10),
    ]);
    expect(a.length + b.length).toBe(1);
  });

  it("retries temporary failures with +1/+5/+15 minutes then stops", async () => {
    const now = new Date("2026-08-08T10:00:00.000Z");
    expect(nextRetryAt(0, now)?.toISOString()).toBe(
      "2026-08-08T10:01:00.000Z",
    );
    expect(nextRetryAt(1, now)?.toISOString()).toBe(
      "2026-08-08T10:05:00.000Z",
    );
    expect(nextRetryAt(2, now)?.toISOString()).toBe(
      "2026-08-08T10:15:00.000Z",
    );
    expect(nextRetryAt(3, now)).toBeNull();

    const store = new InMemoryPublicationStore([
      duePub({
        id: "p-retry",
        scheduledAt: new Date(now.getTime() - 1000),
        idempotencyKey: "retry-1",
      }),
    ]);

    const scheduler = new SocialPostScheduler(store, "w1", async () => {
      throw Object.assign(new Error("RATE_LIMITED"), { code: "RATE_LIMITED" });
    });
    const result = await scheduler.tick(now);
    expect(result.failed).toBe(1);
    const item = store.getAll()[0]!;
    expect(item.status).toBe("SCHEDULED");
    expect(item.scheduledAt.toISOString()).toBe("2026-08-08T10:01:00.000Z");
    expect(item.retryCount).toBe(1);
  });

  it("never retries permanent Meta errors", async () => {
    for (const code of NON_RETRYABLE_ERRORS) {
      expect(isRetryableError(code)).toBe(false);
    }

    const now = new Date("2026-08-08T10:00:00.000Z");
    const store = new InMemoryPublicationStore([
      duePub({
        id: "p-perm",
        scheduledAt: new Date(now.getTime() - 1000),
        idempotencyKey: "perm-1",
      }),
    ]);

    const scheduler = new SocialPostScheduler(store, "w1", async () => {
      throw Object.assign(new Error("TOKEN_PERMANENTLY_INVALID"), {
        code: "TOKEN_PERMANENTLY_INVALID",
      });
    });
    await scheduler.tick(now);
    const item = store.getAll()[0]!;
    expect(item.status).toBe("FAILED");
    expect(item.lastError).toBe("TOKEN_PERMANENTLY_INVALID");
  });

  it("rejects duplicate idempotency keys on create", async () => {
    const store = new InMemoryPublicationStore();
    await store.create({
      contentDraftId: "d1",
      platform: "FACEBOOK",
      socialAccountId: "acc",
      scheduledAt: "2026-08-08T12:00:00.000Z",
      timezone: "UTC",
      idempotencyKey: "same-key",
    });
    await expect(
      store.create({
        contentDraftId: "d1",
        platform: "INSTAGRAM",
        socialAccountId: "acc",
        scheduledAt: "2026-08-08T12:00:00.000Z",
        timezone: "UTC",
        idempotencyKey: "same-key",
      }),
    ).rejects.toBeInstanceOf(PublicationStoreError);
  });

  it("logs start/end/duration/result/error/nextRetry for each attempt", async () => {
    const now = new Date("2026-08-08T10:00:00.000Z");
    const store = new InMemoryPublicationStore([
      duePub({
        scheduledAt: new Date(now.getTime() - 1000),
        idempotencyKey: "log-1",
      }),
    ]);
    const logs: PublishAttemptLog[] = [];

    const scheduler = new SocialPostScheduler(
      store,
      "worker-log",
      async () => {
        throw Object.assign(new Error("RATE_LIMITED"), { code: "RATE_LIMITED" });
      },
      async (event) => {
        logs.push(event);
      },
    );

    await scheduler.tick(now);
    expect(logs.some((l) => l.status === "RUNNING")).toBe(true);
    const failed = logs.find((l) => l.status === "FAILED");
    expect(failed?.durationMs).toBeGreaterThanOrEqual(0);
    expect(failed?.errorCode).toBe("RATE_LIMITED");
    expect(failed?.nextRetryAt).toBe("2026-08-08T10:01:00.000Z");
    expect(failed?.startedAt).toBeTruthy();
    expect(failed?.finishedAt).toBeTruthy();
    expect(failed?.correlationId).toBeTruthy();
  });

  it("blocks publish gates when draft not approved or asset missing", () => {
    expect(() =>
      assertPublishGates({
        idempotencyKey: "k",
        draftStatus: "DRAFT",
        mediaUrls: ["https://example.com/a.png"],
      }),
    ).toThrow(PublishGateError);

    expect(() =>
      assertPublishGates({
        idempotencyKey: "k",
        draftStatus: "APPROVED",
        mediaUrls: [],
      }),
    ).toThrow(PublishGateError);
  });
});
