import { prisma } from "@/lib/database/prisma";
import {
  assertPublishGates,
  PublishGateError,
} from "@/features/publishing/publish-gates";
import {
  getContentDraftRepository,
  type ContentDraftRecord,
} from "@/server/repositories/content-draft-repository";
import type { ScheduledPublication } from "@/providers/scheduler/social-post-scheduler";
import {
  inferPublishMime,
  metaPublisher,
  type MetaPublisher,
  type PublishResult,
} from "@/providers/meta";
import type { ContentStatus } from "@/lib/validation/status-transitions";

export async function resolveMediaUrls(
  contentDraftId: string,
): Promise<string[]> {
  try {
    const slides = await prisma.contentSlide.findMany({
      where: { contentDraftId },
      orderBy: { position: "asc" },
    });
    const urls = slides
      .map((s) => s.renderedAssetUrl)
      .filter((u): u is string => Boolean(u));
    if (urls.length > 0) return urls;
  } catch {
    // DB may be unavailable in memory-mode tests; fall through.
  }

  const draft = await getContentDraftRepository().findById(contentDraftId);
  const state = draft?.pipelineState;
  if (state && typeof state === "object" && !Array.isArray(state)) {
    const previewUrls = (state as { previewUrls?: unknown }).previewUrls;
    if (Array.isArray(previewUrls)) {
      return previewUrls.filter((u): u is string => typeof u === "string");
    }
  }
  return [];
}

async function markDraftPublished(
  draft: ContentDraftRecord,
): Promise<void> {
  const repo = getContentDraftRepository();
  let current = draft;
  const toProcessing: ContentStatus[] = ["APPROVED", "SCHEDULED"];
  if (toProcessing.includes(current.status as ContentStatus)) {
    current = await repo.updateStatus(current.id, {
      status: "PROCESSING",
      expectedVersion: current.version,
    });
  }
  if (current.status === "PROCESSING") {
    await repo.updateStatus(current.id, {
      status: "PUBLISHED",
      expectedVersion: current.version,
    });
  }
}

export async function publishScheduledPost(
  pub: ScheduledPublication,
  options?: {
    mediaUrls?: string[];
    publisher?: MetaPublisher;
  },
): Promise<PublishResult> {
  if (!pub.idempotencyKey?.trim()) {
    throw new PublishGateError("VALIDATION_REJECTED", "Missing idempotencyKey");
  }

  const draft = await getContentDraftRepository().findById(pub.contentDraftId);
  const mediaUrls =
    options?.mediaUrls ?? (await resolveMediaUrls(pub.contentDraftId));
  const postType = draft?.type ?? null;

  assertPublishGates({
    idempotencyKey: pub.idempotencyKey,
    draftStatus: draft?.status ?? null,
    mediaUrls,
    postType,
  });

  if (!postType) {
    throw new PublishGateError(
      "VALIDATION_REJECTED",
      "Draft postType is required for publishing",
    );
  }

  const mimeTypes = mediaUrls.map((url) => {
    const mime = inferPublishMime(url);
    if (!mime) {
      throw new PublishGateError(
        "VALIDATION_REJECTED",
        `Unsupported or unknown media mime for URL: ${url}`,
      );
    }
    return mime;
  });

  const publisher = options?.publisher ?? metaPublisher;
  await publisher.validateAccount(pub.socialAccountId);

  const caption =
    draft && typeof draft.generatedContent === "object" && draft.generatedContent
      ? String(
          (draft.generatedContent as { caption?: string }).caption ??
            draft.topic,
        )
      : "Scheduled post";

  const result = await publisher.publish({
    platform: pub.platform,
    postType,
    caption: caption.slice(0, 2200),
    mediaUrls,
    mimeTypes,
    contentDraftId: pub.contentDraftId,
    publicationId: pub.id,
    idempotencyKey: pub.idempotencyKey,
    accountId: pub.socialAccountId,
  });

  if (draft && draft.status !== "PUBLISHED") {
    try {
      await markDraftPublished(draft);
    } catch {
      // Best-effort status sync — publish already succeeded.
    }
  }

  return result;
}
