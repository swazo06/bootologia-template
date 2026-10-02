import type { ContentDraft, ContentStatus, PostType, Prisma } from "@prisma/client";
import { prisma } from "@/lib/database/prisma";

export type ContentDraftRecord = ContentDraft;

export type ContentDraftCreateInput = {
  brandId: string;
  templateId: string;
  type: PostType;
  topic: string;
  objective: string;
  language: string;
  status?: ContentStatus;
  version?: number;
  generatedContent?: Prisma.InputJsonValue;
  qualityReport?: Prisma.InputJsonValue;
  idempotencyKey?: string;
};

export type ContentDraftStatusUpdate = {
  status: ContentStatus;
  expectedVersion: number;
  approvedAt?: Date | null;
  approvedBy?: string | null;
  rejectedAt?: Date | null;
  rejectedBy?: string | null;
};

export class ContentDraftError extends Error {
  readonly code:
    | "CONTENT_NOT_FOUND"
    | "VERSION_CONFLICT"
    | "CONTENT_IMMUTABLE"
    | "INVALID_TRANSITION";

  constructor(
    code:
      | "CONTENT_NOT_FOUND"
      | "VERSION_CONFLICT"
      | "CONTENT_IMMUTABLE"
      | "INVALID_TRANSITION",
    message?: string,
  ) {
    super(message ?? code);
    this.name = "ContentDraftError";
    this.code = code;
  }
}

export interface ContentDraftRepository {
  create(input: ContentDraftCreateInput): Promise<ContentDraftRecord>;
  findById(id: string): Promise<ContentDraftRecord | null>;
  updateStatus(
    id: string,
    update: ContentDraftStatusUpdate,
  ): Promise<ContentDraftRecord>;
}

function now(): Date {
  return new Date();
}

export class InMemoryContentDraftRepository implements ContentDraftRepository {
  private readonly drafts = new Map<string, ContentDraftRecord>();
  private seq = 0;

  reset(): void {
    this.drafts.clear();
    this.seq = 0;
  }

  async create(input: ContentDraftCreateInput): Promise<ContentDraftRecord> {
    this.seq += 1;
    const id = `draft_${this.seq}`;
    const createdAt = now();
    const record: ContentDraftRecord = {
      id,
      brandId: input.brandId,
      templateId: input.templateId,
      type: input.type,
      topic: input.topic,
      objective: input.objective,
      language: input.language,
      generatedContent: (input.generatedContent as Prisma.JsonValue) ?? null,
      qualityReport: (input.qualityReport as Prisma.JsonValue) ?? null,
      status: input.status ?? "DRAFT",
      version: input.version ?? 1,
      approvedAt: null,
      approvedBy: null,
      rejectedAt: null,
      rejectedBy: null,
      idempotencyKey: input.idempotencyKey ?? null,
      pipelineState: null,
      createdAt,
      updatedAt: createdAt,
    };
    this.drafts.set(id, record);
    return { ...record };
  }

  async findById(id: string): Promise<ContentDraftRecord | null> {
    const found = this.drafts.get(id);
    return found ? { ...found } : null;
  }

  async setPipelineState(
    id: string,
    pipelineState: Record<string, unknown>,
  ): Promise<ContentDraftRecord> {
    const current = this.drafts.get(id);
    if (!current) throw new ContentDraftError("CONTENT_NOT_FOUND");
    const next: ContentDraftRecord = {
      ...current,
      pipelineState: pipelineState as Prisma.JsonValue,
      updatedAt: now(),
    };
    this.drafts.set(id, next);
    return { ...next };
  }

  async updateStatus(
    id: string,
    update: ContentDraftStatusUpdate,
  ): Promise<ContentDraftRecord> {
    const current = this.drafts.get(id);
    if (!current) {
      throw new ContentDraftError("CONTENT_NOT_FOUND");
    }
    if (current.status === "PUBLISHED") {
      throw new ContentDraftError("CONTENT_IMMUTABLE");
    }
    if (current.version !== update.expectedVersion) {
      throw new ContentDraftError("VERSION_CONFLICT");
    }

    const next: ContentDraftRecord = {
      ...current,
      status: update.status,
      version: current.version + 1,
      approvedAt:
        update.approvedAt !== undefined ? update.approvedAt : current.approvedAt,
      approvedBy:
        update.approvedBy !== undefined ? update.approvedBy : current.approvedBy,
      rejectedAt:
        update.rejectedAt !== undefined ? update.rejectedAt : current.rejectedAt,
      rejectedBy:
        update.rejectedBy !== undefined ? update.rejectedBy : current.rejectedBy,
      updatedAt: now(),
    };
    this.drafts.set(id, next);
    return { ...next };
  }
}

export class PrismaContentDraftRepository implements ContentDraftRepository {
  async create(input: ContentDraftCreateInput): Promise<ContentDraftRecord> {
    return prisma.contentDraft.create({
      data: {
        brandId: input.brandId,
        templateId: input.templateId,
        type: input.type,
        topic: input.topic,
        objective: input.objective,
        language: input.language,
        status: input.status ?? "DRAFT",
        version: input.version ?? 1,
        generatedContent: input.generatedContent,
        qualityReport: input.qualityReport,
        idempotencyKey: input.idempotencyKey,
      },
    });
  }

  async findById(id: string): Promise<ContentDraftRecord | null> {
    return prisma.contentDraft.findUnique({ where: { id } });
  }

  async updateStatus(
    id: string,
    update: ContentDraftStatusUpdate,
  ): Promise<ContentDraftRecord> {
    const current = await this.findById(id);
    if (!current) {
      throw new ContentDraftError("CONTENT_NOT_FOUND");
    }
    if (current.status === "PUBLISHED") {
      throw new ContentDraftError("CONTENT_IMMUTABLE");
    }
    if (current.version !== update.expectedVersion) {
      throw new ContentDraftError("VERSION_CONFLICT");
    }

    try {
      return await prisma.contentDraft.update({
        where: { id, version: update.expectedVersion },
        data: {
          status: update.status,
          version: { increment: 1 },
          approvedAt: update.approvedAt,
          approvedBy: update.approvedBy,
          rejectedAt: update.rejectedAt,
          rejectedBy: update.rejectedBy,
        },
      });
    } catch {
      throw new ContentDraftError("VERSION_CONFLICT");
    }
  }
}

const globalDrafts = globalThis as unknown as {
  contentDraftMemoryRepo?: InMemoryContentDraftRepository;
};

export function getInMemoryContentDraftRepository(): InMemoryContentDraftRepository {
  if (!globalDrafts.contentDraftMemoryRepo) {
    globalDrafts.contentDraftMemoryRepo = new InMemoryContentDraftRepository();
  }
  return globalDrafts.contentDraftMemoryRepo;
}

export function getContentDraftRepository(): ContentDraftRepository {
  if (process.env.CONTENT_DRAFTS_IN_MEMORY !== "false") {
    return getInMemoryContentDraftRepository();
  }
  return new PrismaContentDraftRepository();
}

export async function attachContentDraftPipelineState(
  draftId: string,
  pipelineState: Record<string, unknown>,
): Promise<ContentDraftRecord> {
  if (process.env.CONTENT_DRAFTS_IN_MEMORY !== "false") {
    return getInMemoryContentDraftRepository().setPipelineState(
      draftId,
      pipelineState,
    );
  }

  return prisma.contentDraft.update({
    where: { id: draftId },
    data: { pipelineState: pipelineState as Prisma.InputJsonValue },
  });
}
