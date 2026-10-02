import { prisma } from "@/lib/database/prisma";
import { sanitizeForLogs } from "@/lib/logging/logger";
import type { JobLogStatus } from "@prisma/client";

export type WriteJobLogInput = {
  contentDraftId?: string;
  publicationId?: string;
  provider: string;
  action: string;
  status: JobLogStatus;
  correlationId?: string;
  durationMs?: number;
  requestSummary?: unknown;
  responseSummary?: unknown;
  errorCode?: string;
};

export async function writeJobLog(input: WriteJobLogInput) {
  try {
    return await prisma.jobLog.create({
      data: {
        contentDraftId: input.contentDraftId,
        publicationId: input.publicationId,
        provider: input.provider,
        action: input.action,
        status: input.status,
        correlationId: input.correlationId,
        durationMs: input.durationMs,
        requestSummary: input.requestSummary
          ? (sanitizeForLogs(input.requestSummary) as object)
          : undefined,
        responseSummary: input.responseSummary
          ? (sanitizeForLogs(input.responseSummary) as object)
          : undefined,
        errorCode: input.errorCode,
      },
    });
  } catch {
    // Observability must not break the main flow when DB is unavailable in tests.
    return null;
  }
}

export class InMemoryJobLogStore {
  readonly entries: Array<{
    provider: string;
    action: string;
    status: string;
    correlationId?: string;
    durationMs?: number;
    errorCode?: string;
    requestSummary?: unknown;
    responseSummary?: unknown;
  }> = [];

  write(entry: {
    provider: string;
    action: string;
    status: string;
    correlationId?: string;
    durationMs?: number;
    errorCode?: string;
    requestSummary?: unknown;
    responseSummary?: unknown;
  }) {
    this.entries.push({
      ...entry,
      requestSummary: sanitizeForLogs(entry.requestSummary),
      responseSummary: sanitizeForLogs(entry.responseSummary),
    });
  }

  reset(): void {
    this.entries.length = 0;
  }
}
