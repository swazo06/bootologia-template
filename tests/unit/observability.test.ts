import { describe, expect, it, beforeEach } from "vitest";
import { sanitizeForLogs } from "@/lib/logging/logger";
import {
  getMetricsRegistry,
  METRIC,
} from "@/lib/metrics/registry";
import { InMemoryJobLogStore } from "@/server/services/job-log-service";

describe("observability", () => {
  beforeEach(() => {
    getMetricsRegistry().reset();
  });

  it("sanitizes cookies, client_secret, and access_token query params", () => {
    const sanitized = sanitizeForLogs({
      cookie: "session=abc",
      cookies: "a=1",
      client_secret: "shhh",
      ENCRYPTION_KEY: "key",
      url: "https://graph.facebook.com/me?access_token=EAAB_secret",
      nested: { "x-api-key": "k" },
    }) as Record<string, unknown>;

    expect(sanitized.cookie).toBe("[REDACTED]");
    expect(sanitized.cookies).toBe("[REDACTED]");
    expect(sanitized.client_secret).toBe("[REDACTED]");
    expect(sanitized.ENCRYPTION_KEY).toBe("[REDACTED]");
    expect(String(sanitized.url)).toContain("[REDACTED]");
    expect((sanitized.nested as Record<string, unknown>)["x-api-key"]).toBe(
      "[REDACTED]",
    );
  });

  it("records publish and pipeline metrics", () => {
    const metrics = getMetricsRegistry();
    metrics.timing(METRIC.PUBLISH_DURATION, 42, { status: "SUCCESS" });
    metrics.increment(METRIC.PUBLISH_RETRIES, 1, { code: "RATE_LIMITED" });
    metrics.timing(METRIC.PIPELINE_DURATION, 100);
    const snap = metrics.snapshot();
    expect(snap.timings["publish.duration_ms{status=SUCCESS}"]?.lastMs).toBe(
      42,
    );
    expect(snap.counters["publish.retries{code=RATE_LIMITED}"]).toBe(1);
    expect(snap.timings["pipeline.duration_ms"]?.count).toBe(1);
  });

  it("job log store keeps correlationId and durationMs", () => {
    const store = new InMemoryJobLogStore();
    store.write({
      provider: "meta",
      action: "PUBLISH_ATTEMPT",
      status: "SUCCESS",
      correlationId: "corr-1",
      durationMs: 15,
      requestSummary: { access_token: "secret" },
    });
    expect(store.entries[0]?.correlationId).toBe("corr-1");
    expect(store.entries[0]?.durationMs).toBe(15);
    expect(
      (store.entries[0]?.requestSummary as Record<string, unknown>)
        .access_token,
    ).toBe("[REDACTED]");
  });
});
