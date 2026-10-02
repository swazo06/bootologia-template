export class PublishGateError extends Error {
  readonly code: string;

  constructor(code: string, message?: string) {
    super(message ?? code);
    this.name = "PublishGateError";
    this.code = code;
  }
}

const ALLOWED_DRAFT_STATUSES = new Set([
  "APPROVED",
  "SCHEDULED",
  "PROCESSING",
]);

export function assertPublishGates(input: {
  idempotencyKey?: string | null;
  draftStatus?: string | null;
  mediaUrls?: string[] | null;
  postType?: "POSTER" | "CAROUSEL" | null;
}): void {
  if (!input.idempotencyKey?.trim()) {
    throw new PublishGateError("VALIDATION_REJECTED", "Missing idempotencyKey");
  }
  if (!input.draftStatus || !ALLOWED_DRAFT_STATUSES.has(input.draftStatus)) {
    throw new PublishGateError(
      "VALIDATION_REJECTED",
      "Content is not approved for publishing",
    );
  }
  const urls = (input.mediaUrls ?? []).filter((u) => Boolean(u?.trim()));
  if (urls.length === 0) {
    throw new PublishGateError(
      "FILE_NOT_ACCESSIBLE",
      "No public asset URL available",
    );
  }
  if (input.postType === "CAROUSEL" && urls.length < 2) {
    throw new PublishGateError(
      "VALIDATION_REJECTED",
      "Carousel requires at least 2 media URLs",
    );
  }
  if (input.postType === "POSTER" && urls.length !== 1) {
    throw new PublishGateError(
      "VALIDATION_REJECTED",
      "Poster requires exactly 1 media URL",
    );
  }
}
