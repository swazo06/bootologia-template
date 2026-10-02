import { DryRunMetaPublisher } from "@/providers/meta/dry-run-meta-publisher";
import { isMetaPublishingEnabled } from "@/providers/meta/feature-flags";
import { GraphApiMetaPublisher } from "@/providers/meta/graph-api-meta-publisher";
import type { MetaPublisher } from "@/providers/meta/types";

export { DryRunMetaPublisher } from "@/providers/meta/dry-run-meta-publisher";
export { GraphApiMetaPublisher } from "@/providers/meta/graph-api-meta-publisher";
export {
  InMemoryMetaCredentialsProvider,
  SocialAccountCredentialsProvider,
} from "@/providers/meta/credentials";
export {
  createMetaGraphClient,
  FetchMetaGraphClient,
} from "@/providers/meta/meta-graph-client";
export {
  isMetaPublishingEnabled,
  isTestRuntime,
} from "@/providers/meta/feature-flags";
export { mapMetaError } from "@/providers/meta/meta-errors";
export {
  ALLOWED_PUBLISH_MIMES,
  MetaPublishError,
  inferPublishMime,
  publishRequestSchema,
  type MetaPublisher,
  type PublishMime,
  type PublishRequest,
  type PublishResult,
} from "@/providers/meta/types";

/** @deprecated Prefer DryRunMetaPublisher — kept for existing tests. */
export const MockMetaPublisher = DryRunMetaPublisher;

/** @deprecated Prefer GraphApiMetaPublisher. */
export const GraphMetaPublisher = GraphApiMetaPublisher;

/**
 * Factory: DryRun by default. Graph only when feature flags allow real publish
 * (hard-disabled under Vitest).
 */
export function createMetaPublisher(): MetaPublisher {
  if (isMetaPublishingEnabled()) {
    return new GraphApiMetaPublisher();
  }
  return new DryRunMetaPublisher();
}

/** Lazy accessor — always resolves via factory (DI-friendly for cron). */
export function getMetaPublisher(): MetaPublisher {
  return createMetaPublisher();
}

/** @deprecated Prefer getMetaPublisher() / createMetaPublisher(). */
export const metaPublisher: MetaPublisher = {
  publish: (request) => getMetaPublisher().publish(request),
  validateAccount: (accountId) => getMetaPublisher().validateAccount(accountId),
};
