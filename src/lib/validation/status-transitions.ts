export const CONTENT_STATUS = [
  "DRAFT",
  "GENERATING",
  "REVIEW",
  "APPROVED",
  "REJECTED",
  "SCHEDULED",
  "PROCESSING",
  "PUBLISHED",
  "FAILED",
  "CANCELLED",
] as const;

export type ContentStatus = (typeof CONTENT_STATUS)[number];

export const STATUS_TRANSITIONS: Record<ContentStatus, readonly ContentStatus[]> =
  {
    DRAFT: ["GENERATING", "CANCELLED"],
    GENERATING: ["REVIEW", "FAILED"],
    REVIEW: ["APPROVED", "REJECTED"],
    REJECTED: ["DRAFT"],
    APPROVED: ["SCHEDULED", "PROCESSING"],
    SCHEDULED: ["PROCESSING", "CANCELLED"],
    PROCESSING: ["PUBLISHED", "FAILED"],
    FAILED: ["SCHEDULED", "CANCELLED"],
    PUBLISHED: [],
    CANCELLED: [],
  };

export function canTransition(
  from: ContentStatus,
  to: ContentStatus,
): boolean {
  return STATUS_TRANSITIONS[from].includes(to);
}

export function assertTransition(
  from: ContentStatus,
  to: ContentStatus,
): void {
  if (!canTransition(from, to)) {
    throw new Error(`Invalid status transition: ${from} -> ${to}`);
  }
}
