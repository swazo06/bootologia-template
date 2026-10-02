/**
 * Feature flags for Meta publishing.
 * Real Graph HTTP is never enabled under Vitest / NODE_ENV=test.
 */
export function isTestRuntime(): boolean {
  return (
    process.env.VITEST === "true" ||
    process.env.NODE_ENV === "test" ||
    typeof process.env.VITEST_WORKER_ID === "string"
  );
}

/**
 * True only when production Meta publishing is explicitly enabled.
 * Supports ENABLE_META_PUBLISHING (preferred) and META_PUBLISH_ENABLED (alias).
 */
export function isMetaPublishingEnabled(): boolean {
  if (isTestRuntime()) return false;

  const flagOn =
    process.env.ENABLE_META_PUBLISHING === "true" ||
    process.env.META_PUBLISH_ENABLED === "true";
  const dryRunOff = process.env.DRY_RUN === "false";
  return flagOn && dryRunOff;
}
