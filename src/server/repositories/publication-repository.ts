import type { Publication, PublicationStatus } from "@prisma/client";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/database/prisma";
import { toUtcDate } from "@/lib/datetime/timezone";
import type {
  PublicationCreateInput,
  PublicationStore,
  PublishPersistence,
  ScheduledPublication,
} from "@/providers/scheduler/social-post-scheduler";

export class PublicationStoreError extends Error {
  readonly code: "IDEMPOTENCY_CONFLICT" | "NOT_FOUND";

  constructor(code: "IDEMPOTENCY_CONFLICT" | "NOT_FOUND", message?: string) {
    super(message ?? code);
    this.name = "PublicationStoreError";
    this.code = code;
  }
}

function toScheduled(row: Publication): ScheduledPublication {
  return {
    id: row.id,
    contentDraftId: row.contentDraftId,
    platform: row.platform,
    socialAccountId: row.socialAccountId,
    status: row.status,
    scheduledAt: row.scheduledAt,
    timezone: row.timezone,
    retryCount: row.retryCount,
    idempotencyKey: row.idempotencyKey,
    lockedAt: row.lockedAt,
    lockedBy: row.lockedBy,
    lastError: row.lastError,
    externalPostId: row.externalPostId,
    externalPostUrl: row.externalPostUrl,
    publishedAt: row.publishedAt,
  };
}

export class InMemoryPublicationStore implements PublicationStore {
  private items: ScheduledPublication[] = [];
  private seq = 0;

  constructor(items: ScheduledPublication[] = []) {
    this.items = items.map((i) => ({ ...i }));
  }

  seed(items: ScheduledPublication[]) {
    this.items = items.map((i) => ({ ...i }));
  }

  reset() {
    this.items = [];
    this.seq = 0;
  }

  async create(input: PublicationCreateInput): Promise<ScheduledPublication> {
    if (this.items.some((p) => p.idempotencyKey === input.idempotencyKey)) {
      throw new PublicationStoreError("IDEMPOTENCY_CONFLICT");
    }
    this.seq += 1;
    const record: ScheduledPublication = {
      id: `pub_${this.seq}`,
      contentDraftId: input.contentDraftId,
      platform: input.platform,
      socialAccountId: input.socialAccountId,
      status: "SCHEDULED",
      scheduledAt: toUtcDate(input.scheduledAt),
      timezone: input.timezone,
      retryCount: 0,
      idempotencyKey: input.idempotencyKey,
      lockedAt: null,
      lockedBy: null,
      lastError: null,
      externalPostId: null,
      externalPostUrl: null,
      publishedAt: null,
    };
    this.items.push(record);
    return { ...record };
  }

  async findByIdempotencyKey(
    key: string,
  ): Promise<ScheduledPublication | null> {
    const found = this.items.find((p) => p.idempotencyKey === key);
    return found ? { ...found } : null;
  }

  async claimDue(
    now: Date,
    workerId: string,
    limit: number,
  ): Promise<ScheduledPublication[]> {
    const due = this.items
      .filter(
        (p) =>
          p.status === "SCHEDULED" &&
          p.scheduledAt.getTime() <= now.getTime() &&
          !p.lockedAt,
      )
      .slice(0, limit);

    for (const item of due) {
      item.status = "PROCESSING";
      item.lockedAt = now;
      item.lockedBy = workerId;
    }
    return due.map((d) => ({ ...d }));
  }

  async markPublished(id: string, result?: PublishPersistence): Promise<void> {
    const item = this.items.find((p) => p.id === id);
    if (!item) return;
    item.status = "PUBLISHED";
    item.lockedAt = null;
    item.lockedBy = null;
    item.lastError = null;
    item.publishedAt = result?.publishedAt ?? new Date();
    if (result) {
      item.externalPostId = result.externalPostId;
      item.externalPostUrl = result.externalPostUrl;
    }
  }

  async markFailed(
    id: string,
    errorCode: string,
    retryAt: Date | null,
  ): Promise<void> {
    const item = this.items.find((p) => p.id === id);
    if (!item) return;
    item.lastError = errorCode;
    item.retryCount += 1;
    item.lockedAt = null;
    item.lockedBy = null;
    if (retryAt) {
      item.status = "SCHEDULED";
      item.scheduledAt = retryAt;
    } else {
      item.status = "FAILED";
    }
  }

  /** Test helper */
  getAll(): ScheduledPublication[] {
    return this.items.map((i) => ({ ...i }));
  }
}

export class PrismaPublicationStore implements PublicationStore {
  async create(input: PublicationCreateInput): Promise<ScheduledPublication> {
    try {
      const row = await prisma.publication.create({
        data: {
          contentDraftId: input.contentDraftId,
          platform: input.platform,
          socialAccountId: input.socialAccountId,
          scheduledAt: toUtcDate(input.scheduledAt),
          timezone: input.timezone,
          idempotencyKey: input.idempotencyKey,
          status: "SCHEDULED",
        },
      });
      return toScheduled(row);
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        throw new PublicationStoreError("IDEMPOTENCY_CONFLICT");
      }
      throw error;
    }
  }

  async findByIdempotencyKey(
    key: string,
  ): Promise<ScheduledPublication | null> {
    const row = await prisma.publication.findUnique({
      where: { idempotencyKey: key },
    });
    return row ? toScheduled(row) : null;
  }

  async claimDue(
    now: Date,
    workerId: string,
    limit: number,
  ): Promise<ScheduledPublication[]> {
    return prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<Publication[]>`
        SELECT * FROM "Publication"
        WHERE status = 'SCHEDULED'::"PublicationStatus"
          AND "scheduledAt" <= ${now}
        ORDER BY "scheduledAt" ASC
        LIMIT ${limit}
        FOR UPDATE SKIP LOCKED
      `;

      const claimed: ScheduledPublication[] = [];
      for (const row of rows) {
        const updated = await tx.publication.update({
          where: { id: row.id },
          data: {
            status: "PROCESSING" satisfies PublicationStatus,
            lockedAt: now,
            lockedBy: workerId,
          },
        });
        claimed.push(toScheduled(updated));
      }
      return claimed;
    });
  }

  async markPublished(id: string, result?: PublishPersistence): Promise<void> {
    await prisma.publication.update({
      where: { id },
      data: {
        status: "PUBLISHED",
        publishedAt: result?.publishedAt ?? new Date(),
        lockedAt: null,
        lockedBy: null,
        lastError: null,
        ...(result
          ? {
              externalPostId: result.externalPostId,
              externalPostUrl: result.externalPostUrl,
            }
          : {}),
      },
    });
  }

  async markFailed(
    id: string,
    errorCode: string,
    retryAt: Date | null,
  ): Promise<void> {
    await prisma.publication.update({
      where: { id },
      data: {
        lastError: errorCode,
        retryCount: { increment: 1 },
        lockedAt: null,
        lockedBy: null,
        status: retryAt ? "SCHEDULED" : "FAILED",
        scheduledAt: retryAt ?? undefined,
      },
    });
  }
}

const globalPubs = globalThis as unknown as {
  publicationMemoryStore?: InMemoryPublicationStore;
};

export function getInMemoryPublicationStore(): InMemoryPublicationStore {
  if (!globalPubs.publicationMemoryStore) {
    globalPubs.publicationMemoryStore = new InMemoryPublicationStore();
  }
  return globalPubs.publicationMemoryStore;
}

export function getPublicationStore(): PublicationStore {
  if (process.env.PUBLICATIONS_IN_MEMORY !== "false") {
    return getInMemoryPublicationStore();
  }
  return new PrismaPublicationStore();
}

export { isRetryableError, nextRetryAt } from "@/providers/scheduler/social-post-scheduler";
export type { PublicationCreateInput, ScheduledPublication, PublicationStore };
