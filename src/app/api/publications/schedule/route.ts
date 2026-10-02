import { NextResponse } from "next/server";
import { scheduleRequestSchema } from "@/features/publishing/schedule-service";
import { requireApiEditor } from "@/lib/auth/guards";
import {
  createContentWorkflowService,
  WorkflowError,
} from "@/server/services/content-workflow-service";
import {
  getPublicationStore,
  PublicationStoreError,
} from "@/server/repositories/publication-repository";
import { toUtcDate } from "@/lib/datetime/timezone";

export async function POST(request: Request) {
  try {
    await requireApiEditor();
  } catch (error) {
    const code = error instanceof Error ? error.message : "UNAUTHORIZED";
    return NextResponse.json(
      { error: code },
      { status: code === "FORBIDDEN" ? 403 : 401 },
    );
  }

  const body = await request.json();
  const parsed = scheduleRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "VALIDATION_REJECTED", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  try {
    const workflow = createContentWorkflowService();
    const draft = await workflow.assertSchedulable(parsed.data.contentDraftId);
    const scheduled = await workflow.transition(
      draft.id,
      "SCHEDULED",
      draft.version,
    );

    const store = getPublicationStore();
    const scheduledAt = toUtcDate(parsed.data.scheduledAt);
    const accountId =
      parsed.data.socialAccountId ??
      process.env.META_DEFAULT_ACCOUNT_ID ??
      "demo-account";
    const publicationIds: string[] = [];

    for (const platform of parsed.data.platforms) {
      const idempotencyKey = `${parsed.data.contentDraftId}:${platform}:${scheduledAt.toISOString()}`;
      const pub = await store.create({
        contentDraftId: parsed.data.contentDraftId,
        platform,
        socialAccountId: accountId,
        scheduledAt,
        timezone: parsed.data.timezone,
        idempotencyKey,
      });
      publicationIds.push(pub.id);
    }

    return NextResponse.json({
      publicationIds,
      status: scheduled.status,
      version: scheduled.version,
      scheduledAt: scheduledAt.toISOString(),
      timezone: parsed.data.timezone,
    });
  } catch (error) {
    const code =
      error instanceof WorkflowError
        ? error.code
        : error instanceof PublicationStoreError
          ? error.code
          : error instanceof Error
            ? error.message
            : "UNKNOWN";
    const status =
      code === "CONTENT_NOT_FOUND"
        ? 404
        : code === "VALIDATION_REJECTED" ||
            code === "INVALID_TRANSITION" ||
            code === "VERSION_CONFLICT" ||
            code === "CONTENT_IMMUTABLE" ||
            code === "IDEMPOTENCY_CONFLICT"
          ? 409
          : 400;
    return NextResponse.json({ error: code }, { status });
  }
}
