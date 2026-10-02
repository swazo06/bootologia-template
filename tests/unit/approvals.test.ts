import { describe, expect, it } from "vitest";
import {
  approveContent,
  rejectContent,
  ApprovalError,
} from "@/features/approvals/approval-service";
import { ensureApprovedForSchedule } from "@/features/publishing/schedule-service";

describe("approvals-and-schedule", () => {
  it("approves from REVIEW", () => {
    const result = approveContent({
      status: "REVIEW",
      expectedVersion: 1,
      currentVersion: 1,
    });
    expect(result.status).toBe("APPROVED");
    expect(result.approvedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("rejects version conflicts", () => {
    expect(() =>
      approveContent({
        status: "REVIEW",
        expectedVersion: 1,
        currentVersion: 2,
      }),
    ).toThrow(ApprovalError);
    expect(() =>
      approveContent({
        status: "REVIEW",
        expectedVersion: 1,
        currentVersion: 2,
      }),
    ).toThrow("VERSION_CONFLICT");
  });

  it("blocks invalid transitions with typed error", () => {
    expect(() =>
      approveContent({
        status: "DRAFT",
        expectedVersion: 1,
        currentVersion: 1,
      }),
    ).toThrow(ApprovalError);
  });

  it("blocks scheduling when not APPROVED", () => {
    expect(() => ensureApprovedForSchedule("DRAFT")).toThrow(
      "VALIDATION_REJECTED",
    );
  });

  it("allows reject then back to draft path", () => {
    expect(rejectContent({ status: "REVIEW" })).toBe("REJECTED");
  });
});
