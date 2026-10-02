import { randomUUID } from "node:crypto";
import {
  getMetricsRegistry,
  METRIC,
} from "@/lib/metrics/registry";

export const NON_RETRYABLE_ERRORS = [
  "PERMISSION_DENIED",
  "ACCOUNT_DISCONNECTED",
  "CONTENT_DELETED",
  "FILE_NOT_ACCESSIBLE",
  "VALIDATION_REJECTED",
  "TOKEN_PERMANENTLY_INVALID",
] as const;

export type NonRetryableError = (typeof NON_RETRYABLE_ERRORS)[number];

export const RETRY_POLICY = [
  { attempt: 1, delayMinutes: 1 },
  { attempt: 2, delayMinutes: 5 },
  { attempt: 3, delayMinutes: 15 },
] as const;

export function isRetryableError(code: string): boolean {
  return !(NON_RETRYABLE_ERRORS as readonly string[]).includes(code);
}

export function nextRetryAt(
  retryCount: number,
  from = new Date(),
): Date | null {
  const policy = RETRY_POLICY.find((p) => p.attempt === retryCount + 1);
  if (!policy) return null;
  return new Date(from.getTime() + policy.delayMinutes * 60_000);
}

export type PublishPersistence = {
  externalPostId: string;
  externalPostUrl: string;
  publishedAt?: Date;
};

export interface ScheduledPublication {
  id: string;
  contentDraftId: string;
  platform: "FACEBOOK" | "INSTAGRAM";
  socialAccountId: string;
  status: "SCHEDULED" | "PROCESSING" | "PUBLISHED" | "FAILED" | "CANCELLED";
  scheduledAt: Date;
  timezone: string;
  retryCount: number;
  idempotencyKey: string;
  lockedAt?: Date | null;
  lockedBy?: string | null;
  lastError?: string | null;
  externalPostId?: string | null;
  externalPostUrl?: string | null;
  publishedAt?: Date | null;
}

export type PublicationCreateInput = {
  contentDraftId: string;
  platform: "FACEBOOK" | "INSTAGRAM";
  socialAccountId: string;
  scheduledAt: Date | string;
  timezone: string;
  idempotencyKey: string;
};

export interface PublicationStore {
  claimDue(
    now: Date,
    workerId: string,
    limit: number,
  ): Promise<ScheduledPublication[]>;
  markPublished(id: string, result?: PublishPersistence): Promise<void>;
  markFailed(
    id: string,
    errorCode: string,
    retryAt: Date | null,
  ): Promise<void>;
  create(input: PublicationCreateInput): Promise<ScheduledPublication>;
  findByIdempotencyKey(key: string): Promise<ScheduledPublication | null>;
}

export type PublishAttemptLog = {
  publicationId: string;
  contentDraftId: string;
  idempotencyKey: string;
  workerId: string;
  correlationId: string;
  status: "RUNNING" | "SUCCESS" | "FAILED";
  startedAt: string;
  finishedAt?: string;
  durationMs?: number;
  errorCode?: string;
  nextRetryAt?: string | null;
};

export type PublishAttemptLogger = (
  event: PublishAttemptLog,
) => void | Promise<void>;

export class SocialPostScheduler {
  constructor(
    private readonly store: PublicationStore,
    private readonly workerId: string,
    private readonly publish: (
      pub: ScheduledPublication,
    ) => Promise<PublishPersistence | void>,
    private readonly onAttemptLog?: PublishAttemptLogger,
  ) {}

  async tick(now = new Date()): Promise<{ processed: number; failed: number }> {
    const claimed = await this.store.claimDue(now, this.workerId, 10);
    let processed = 0;
    let failed = 0;
    const metrics = getMetricsRegistry();

    for (const pub of claimed) {
      const startedAt = new Date().toISOString();
      const startedMs = Date.now();
      const correlationId = randomUUID();
      await this.emitLog({
        publicationId: pub.id,
        contentDraftId: pub.contentDraftId,
        idempotencyKey: pub.idempotencyKey,
        workerId: this.workerId,
        correlationId,
        status: "RUNNING",
        startedAt,
      });

      try {
        const result = await this.publish(pub);
        await this.store.markPublished(
          pub.id,
          result
            ? {
                externalPostId: result.externalPostId,
                externalPostUrl: result.externalPostUrl,
                publishedAt: result.publishedAt,
              }
            : undefined,
        );
        const durationMs = Date.now() - startedMs;
        const finishedAt = new Date().toISOString();
        metrics.timing(METRIC.PUBLISH_DURATION, durationMs, {
          status: "SUCCESS",
        });
        await this.emitLog({
          publicationId: pub.id,
          contentDraftId: pub.contentDraftId,
          idempotencyKey: pub.idempotencyKey,
          workerId: this.workerId,
          correlationId,
          status: "SUCCESS",
          startedAt,
          finishedAt,
          durationMs,
        });
        processed += 1;
      } catch (error) {
        const code = extractErrorCode(error);
        const retryAt = isRetryableError(code)
          ? nextRetryAt(pub.retryCount, now)
          : null;
        await this.store.markFailed(pub.id, code, retryAt);
        const durationMs = Date.now() - startedMs;
        const finishedAt = new Date().toISOString();
        metrics.timing(METRIC.PUBLISH_DURATION, durationMs, {
          status: "FAILED",
        });
        if (retryAt) {
          metrics.increment(METRIC.PUBLISH_RETRIES, 1, { code });
        }
        await this.emitLog({
          publicationId: pub.id,
          contentDraftId: pub.contentDraftId,
          idempotencyKey: pub.idempotencyKey,
          workerId: this.workerId,
          correlationId,
          status: "FAILED",
          startedAt,
          finishedAt,
          durationMs,
          errorCode: code,
          nextRetryAt: retryAt ? retryAt.toISOString() : null,
        });
        failed += 1;
      }
    }

    return { processed, failed };
  }

  private async emitLog(event: PublishAttemptLog): Promise<void> {
    if (!this.onAttemptLog) return;
    await this.onAttemptLog(event);
  }
}

function extractErrorCode(error: unknown): string {
  if (error && typeof error === "object" && "code" in error) {
    const code = (error as { code?: unknown }).code;
    if (typeof code === "string" && code.length > 0) return code;
  }
  if (error instanceof Error && error.message) return error.message;
  return "UNKNOWN";
}

export {
  InMemoryPublicationStore,
  getPublicationStore,
  getInMemoryPublicationStore,
  PublicationStoreError,
} from "@/server/repositories/publication-repository";
