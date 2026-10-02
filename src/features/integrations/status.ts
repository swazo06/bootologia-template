import { isMetaPublishingEnabled } from "@/providers/meta";

/**
 * Integrations feature: connection status for external providers.
 */
export function getIntegrationsStatus() {
  return {
    meta: {
      dryRun: (process.env.DRY_RUN ?? "true") !== "false",
      publishingEnabled: isMetaPublishingEnabled(),
      oauthUi: true,
    },
    ai: {
      provider: process.env.AI_PROVIDER ?? "mock",
    },
  };
}
