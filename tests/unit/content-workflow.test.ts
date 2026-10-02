import { beforeEach, describe, expect, it } from "vitest";
import {
  getInMemoryContentDraftRepository,
} from "@/server/repositories/content-draft-repository";
import {
  ContentWorkflowService,
  WorkflowError,
} from "@/server/services/content-workflow-service";
import { canTransition } from "@/lib/validation/status-transitions";

describe("content-workflow", () => {
  const repo = getInMemoryContentDraftRepository();
  const workflow = new ContentWorkflowService(repo);

  beforeEach(() => {
    repo.reset();
  });

  async function seed(status: "DRAFT" | "GENERATING" | "REVIEW" | "APPROVED" | "PUBLISHED" = "REVIEW") {
    return repo.create({
      brandId: "brand_1",
      templateId: "tpl_1",
      type: "POSTER",
      topic: "Topic",
      objective: "Objective",
      language: "fr",
      status,
      version: 1,
    });
  }

  it("approves REVIEW and sets approvedAt with version bump", async () => {
    const draft = await seed("REVIEW");
    const { draft: approved, approvedAt } = await workflow.approve(
      draft.id,
      1,
      "admin-1",
    );
    expect(approved.status).toBe("APPROVED");
    expect(approved.version).toBe(2);
    expect(approved.approvedBy).toBe("admin-1");
    expect(approved.approvedAt).toBeTruthy();
    expect(approvedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("rejects version conflicts on approve", async () => {
    const draft = await seed("REVIEW");
    await expect(workflow.approve(draft.id, 99, "admin-1")).rejects.toMatchObject({
      code: "VERSION_CONFLICT",
    });
  });

  it("refuses DRAFT to PUBLISHED via transition helper", async () => {
    const draft = await seed("DRAFT");
    expect(canTransition("DRAFT", "PUBLISHED")).toBe(false);
    await expect(workflow.transition(draft.id, "PUBLISHED")).rejects.toMatchObject({
      code: "INVALID_TRANSITION",
    });
  });

  it("marks PUBLISHED as immutable", async () => {
    const draft = await seed("PUBLISHED");
    await expect(workflow.approve(draft.id, 1, "admin-1")).rejects.toBeInstanceOf(
      WorkflowError,
    );
    await expect(
      repo.updateStatus(draft.id, { status: "APPROVED", expectedVersion: 1 }),
    ).rejects.toMatchObject({ code: "CONTENT_IMMUTABLE" });
  });

  it("blocks schedule when not APPROVED", async () => {
    const draft = await seed("REVIEW");
    await expect(workflow.assertSchedulable(draft.id)).rejects.toMatchObject({
      code: "VALIDATION_REJECTED",
    });
  });

  it("allows schedule gate when APPROVED", async () => {
    const draft = await seed("APPROVED");
    const ok = await workflow.assertSchedulable(draft.id);
    expect(ok.status).toBe("APPROVED");
  });

  it("submits GENERATING to REVIEW", async () => {
    const draft = await seed("GENERATING");
    const reviewed = await workflow.submitForReview(draft.id);
    expect(reviewed.status).toBe("REVIEW");
    expect(reviewed.version).toBe(2);
  });

  it("rejects from REVIEW", async () => {
    const draft = await seed("REVIEW");
    const rejected = await workflow.reject(draft.id, 1, "admin-1");
    expect(rejected.status).toBe("REJECTED");
    expect(rejected.rejectedBy).toBe("admin-1");
    expect(rejected.rejectedAt).toBeTruthy();
  });
});
