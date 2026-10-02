import { z } from "zod";

export const ALLOWED_PUBLISH_MIMES = [
  "image/png",
  "image/jpeg",
  "image/webp",
] as const;

export type PublishMime = (typeof ALLOWED_PUBLISH_MIMES)[number];

export const publishRequestSchema = z
  .object({
    platform: z.enum(["FACEBOOK", "INSTAGRAM"]),
    postType: z.enum(["POSTER", "CAROUSEL"]),
    caption: z.string().max(2200),
    /** Public asset URLs (poster: 1, carousel: ≥2). */
    mediaUrls: z.array(z.string().url().min(1)).min(1),
    mimeTypes: z.array(z.enum(ALLOWED_PUBLISH_MIMES)).min(1),
    contentDraftId: z.string().min(1),
    publicationId: z.string().min(1),
    idempotencyKey: z.string().min(1),
    accountId: z.string().min(1),
  })
  .strict()
  .superRefine((data, ctx) => {
    if (data.mimeTypes.length !== data.mediaUrls.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "mimeTypes length must match mediaUrls",
        path: ["mimeTypes"],
      });
    }
    if (data.postType === "POSTER" && data.mediaUrls.length !== 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Poster requires exactly 1 media URL",
        path: ["mediaUrls"],
      });
    }
    if (data.postType === "CAROUSEL" && data.mediaUrls.length < 2) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Carousel requires at least 2 media URLs",
        path: ["mediaUrls"],
      });
    }
  });

export type PublishRequest = z.infer<typeof publishRequestSchema>;

/**
 * Same contract for DryRun and Graph. `dryRun` is metadata for ops only —
 * callers persist external IDs the same way either way.
 */
export interface PublishResult {
  dryRun: boolean;
  externalPostId: string;
  externalPostUrl: string;
}

/** Scheduler / feature code depends only on this interface. */
export interface MetaPublisher {
  publish(request: PublishRequest): Promise<PublishResult>;
  validateAccount(accountId: string): Promise<void>;
}

export class MetaPublishError extends Error {
  readonly code: string;

  constructor(code: string, message?: string) {
    super(message ?? code);
    this.name = "MetaPublishError";
    this.code = code;
  }
}

export function inferPublishMime(url: string): PublishMime | null {
  const path = url.split("?")[0]?.toLowerCase() ?? "";
  if (path.endsWith(".png")) return "image/png";
  if (path.endsWith(".jpg") || path.endsWith(".jpeg")) return "image/jpeg";
  if (path.endsWith(".webp")) return "image/webp";
  return null;
}
