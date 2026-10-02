import {
  assertTransition,
  type ContentStatus,
} from "@/lib/validation/status-transitions";

export class ApprovalError extends Error {
  readonly code:
    | "VERSION_CONFLICT"
    | "INVALID_TRANSITION"
    | "CONTENT_NOT_FOUND";

  constructor(
    code: "VERSION_CONFLICT" | "INVALID_TRANSITION" | "CONTENT_NOT_FOUND",
    message?: string,
  ) {
    super(message ?? code);
    this.name = "ApprovalError";
    this.code = code;
  }
}

export function approveContent(input: {
  status: ContentStatus;
  expectedVersion: number;
  currentVersion: number;
}): { status: "APPROVED"; approvedAt: string } {
  if (input.expectedVersion !== input.currentVersion) {
    throw new ApprovalError("VERSION_CONFLICT");
  }
  try {
    assertTransition(input.status, "APPROVED");
  } catch (error) {
    throw new ApprovalError(
      "INVALID_TRANSITION",
      error instanceof Error ? error.message : "INVALID_TRANSITION",
    );
  }
  return {
    status: "APPROVED",
    approvedAt: new Date().toISOString(),
  };
}

export function scheduleContent(input: {
  status: ContentStatus;
}): ContentStatus {
  try {
    assertTransition(input.status, "SCHEDULED");
  } catch (error) {
    throw new ApprovalError(
      "INVALID_TRANSITION",
      error instanceof Error ? error.message : "INVALID_TRANSITION",
    );
  }
  return "SCHEDULED";
}

export function rejectContent(input: {
  status: ContentStatus;
}): ContentStatus {
  try {
    assertTransition(input.status, "REJECTED");
  } catch (error) {
    throw new ApprovalError(
      "INVALID_TRANSITION",
      error instanceof Error ? error.message : "INVALID_TRANSITION",
    );
  }
  return "REJECTED";
}
