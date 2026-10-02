import { z } from "zod";
import {
  assertTransition,
  type ContentStatus,
} from "@/lib/validation/status-transitions";
import { platformSchema } from "@/lib/validation/schemas";

export const approveRequestSchema = z.object({
  expectedVersion: z.number().int().positive(),
});

export const scheduleRequestSchema = z.object({
  contentDraftId: z.string().min(1),
  platforms: z.array(platformSchema).min(1),
  scheduledAt: z.string().datetime(),
  timezone: z.string().min(1),
  socialAccountId: z.string().min(1).optional(),
});

export const renderRequestSchema = z.object({
  templateId: z.string().min(1),
  contentDraftId: z.string().min(1),
  version: z.number().int().positive(),
});

export function ensureApprovedForSchedule(status: ContentStatus): void {
  if (status !== "APPROVED") {
    throw new Error("VALIDATION_REJECTED");
  }
  assertTransition(status, "SCHEDULED");
}
