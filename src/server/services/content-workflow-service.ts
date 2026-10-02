import {
  assertTransition,
  type ContentStatus,
} from "@/lib/validation/status-transitions";
import {
  ContentDraftError,
  getContentDraftRepository,
  type ContentDraftRecord,
  type ContentDraftRepository,
} from "@/server/repositories/content-draft-repository";

export class WorkflowError extends Error {
  readonly code:
    | "CONTENT_NOT_FOUND"
    | "VERSION_CONFLICT"
    | "CONTENT_IMMUTABLE"
    | "INVALID_TRANSITION"
    | "VALIDATION_REJECTED";

  constructor(
    code:
      | "CONTENT_NOT_FOUND"
      | "VERSION_CONFLICT"
      | "CONTENT_IMMUTABLE"
      | "INVALID_TRANSITION"
      | "VALIDATION_REJECTED",
    message?: string,
  ) {
    super(message ?? code);
    this.name = "WorkflowError";
    this.code = code;
  }
}

function mapRepoError(error: unknown): never {
  if (error instanceof ContentDraftError) {
    throw new WorkflowError(error.code, error.message);
  }
  if (error instanceof Error && error.message.startsWith("Invalid status transition")) {
    throw new WorkflowError("INVALID_TRANSITION", error.message);
  }
  throw error;
}

export class ContentWorkflowService {
  constructor(
    private readonly drafts: ContentDraftRepository = getContentDraftRepository(),
  ) {}

  async submitForReview(id: string): Promise<ContentDraftRecord> {
    const draft = await this.requireDraft(id);
    try {
      assertTransition(draft.status, "REVIEW");
      return await this.drafts.updateStatus(id, {
        status: "REVIEW",
        expectedVersion: draft.version,
      });
    } catch (error) {
      mapRepoError(error);
    }
  }

  async approve(
    id: string,
    expectedVersion: number,
    actorId: string,
  ): Promise<{ draft: ContentDraftRecord; approvedAt: string }> {
    const draft = await this.requireDraft(id);
    if (expectedVersion !== draft.version) {
      throw new WorkflowError("VERSION_CONFLICT");
    }
    try {
      assertTransition(draft.status, "APPROVED");
      const approvedAt = new Date();
      const updated = await this.drafts.updateStatus(id, {
        status: "APPROVED",
        expectedVersion,
        approvedAt,
        approvedBy: actorId,
        rejectedAt: null,
        rejectedBy: null,
      });
      return { draft: updated, approvedAt: approvedAt.toISOString() };
    } catch (error) {
      mapRepoError(error);
    }
  }

  async reject(
    id: string,
    expectedVersion: number,
    actorId: string,
  ): Promise<ContentDraftRecord> {
    const draft = await this.requireDraft(id);
    if (expectedVersion !== draft.version) {
      throw new WorkflowError("VERSION_CONFLICT");
    }
    try {
      assertTransition(draft.status, "REJECTED");
      const rejectedAt = new Date();
      return await this.drafts.updateStatus(id, {
        status: "REJECTED",
        expectedVersion,
        rejectedAt,
        rejectedBy: actorId,
      });
    } catch (error) {
      mapRepoError(error);
    }
  }

  async transition(
    id: string,
    to: ContentStatus,
    expectedVersion?: number,
  ): Promise<ContentDraftRecord> {
    const draft = await this.requireDraft(id);
    const version = expectedVersion ?? draft.version;
    if (version !== draft.version) {
      throw new WorkflowError("VERSION_CONFLICT");
    }
    try {
      assertTransition(draft.status, to);
      return await this.drafts.updateStatus(id, {
        status: to,
        expectedVersion: version,
      });
    } catch (error) {
      mapRepoError(error);
    }
  }

  async assertSchedulable(id: string): Promise<ContentDraftRecord> {
    const draft = await this.requireDraft(id);
    if (draft.status !== "APPROVED") {
      throw new WorkflowError("VALIDATION_REJECTED");
    }
    try {
      assertTransition(draft.status, "SCHEDULED");
    } catch (error) {
      mapRepoError(error);
    }
    return draft;
  }

  private async requireDraft(id: string): Promise<ContentDraftRecord> {
    const draft = await this.drafts.findById(id);
    if (!draft) {
      throw new WorkflowError("CONTENT_NOT_FOUND");
    }
    return draft;
  }
}

export function createContentWorkflowService(
  drafts: ContentDraftRepository = getContentDraftRepository(),
): ContentWorkflowService {
  return new ContentWorkflowService(drafts);
}
