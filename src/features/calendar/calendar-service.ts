import { getInMemoryPublicationStore } from "@/server/repositories/publication-repository";
import type { ScheduledPublication } from "@/providers/scheduler/social-post-scheduler";

/**
 * Calendar feature: read model over scheduled publications (UTC stored).
 */
export function listCalendarPublications(): ScheduledPublication[] {
  return getInMemoryPublicationStore()
    .getAll()
    .slice()
    .sort((a, b) => a.scheduledAt.getTime() - b.scheduledAt.getTime());
}
