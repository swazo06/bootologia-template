import { NextResponse } from "next/server";
import {
  SocialPostScheduler,
  type PublishAttemptLog,
} from "@/providers/scheduler/social-post-scheduler";
import { getPublicationStore } from "@/server/repositories/publication-repository";
import { publishScheduledPost } from "@/features/publishing/publish-scheduled";
import { createMetaPublisher } from "@/providers/meta";
import { writeJobLog } from "@/server/services/job-log-service";
import type { JobLogStatus } from "@prisma/client";

async function logPublishAttempt(event: PublishAttemptLog): Promise<void> {
  await writeJobLog({
    contentDraftId: event.contentDraftId,
    publicationId: event.publicationId,
    provider: "meta",
    action: "PUBLISH_ATTEMPT",
    status: event.status as JobLogStatus,
    correlationId: event.correlationId,
    durationMs: event.durationMs,
    errorCode: event.errorCode,
    requestSummary: {
      workerId: event.workerId,
      idempotencyKey: event.idempotencyKey,
      correlationId: event.correlationId,
      startedAt: event.startedAt,
    },
    responseSummary: {
      finishedAt: event.finishedAt,
      durationMs: event.durationMs,
      nextRetryAt: event.nextRetryAt,
      result: event.status,
    },
  });
}

export async function POST() {
  const store = getPublicationStore();
  const publisher = createMetaPublisher();
  const scheduler = new SocialPostScheduler(
    store,
    process.env.SCHEDULER_WORKER_ID ?? "worker-1",
    async (pub) => publishScheduledPost(pub, { publisher }),
    logPublishAttempt,
  );

  const result = await scheduler.tick();
  return NextResponse.json({ ok: true, ...result });
}
