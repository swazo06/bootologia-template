type MetricSample = {
  name: string;
  value: number;
  tags?: Record<string, string>;
  at: string;
};

export type MetricsSnapshot = {
  counters: Record<string, number>;
  timings: Record<
    string,
    { count: number; sumMs: number; avgMs: number; lastMs: number }
  >;
  recent: MetricSample[];
};

const MAX_RECENT = 200;

/**
 * In-process metrics registry (no OpenTelemetry). Safe for single-instance
 * Node/Vercel function introspection via /api/metrics.
 */
export class MetricsRegistry {
  private readonly counters = new Map<string, number>();
  private readonly timings = new Map<
    string,
    { count: number; sumMs: number; lastMs: number }
  >;
  private readonly recent: MetricSample[] = [];

  increment(name: string, by = 1, tags?: Record<string, string>): void {
    const key = metricKey(name, tags);
    this.counters.set(key, (this.counters.get(key) ?? 0) + by);
    this.pushRecent({ name, value: by, tags, at: new Date().toISOString() });
  }

  timing(name: string, durationMs: number, tags?: Record<string, string>): void {
    const key = metricKey(name, tags);
    const current = this.timings.get(key) ?? {
      count: 0,
      sumMs: 0,
      lastMs: 0,
    };
    current.count += 1;
    current.sumMs += durationMs;
    current.lastMs = durationMs;
    this.timings.set(key, current);
    this.pushRecent({
      name,
      value: durationMs,
      tags,
      at: new Date().toISOString(),
    });
  }

  snapshot(): MetricsSnapshot {
    const counters: MetricsSnapshot["counters"] = {};
    for (const [k, v] of this.counters) counters[k] = v;

    const timings: MetricsSnapshot["timings"] = {};
    for (const [k, v] of this.timings) {
      timings[k] = {
        count: v.count,
        sumMs: v.sumMs,
        avgMs: v.count ? v.sumMs / v.count : 0,
        lastMs: v.lastMs,
      };
    }

    return {
      counters,
      timings,
      recent: [...this.recent],
    };
  }

  reset(): void {
    this.counters.clear();
    this.timings.clear();
    this.recent.length = 0;
  }

  private pushRecent(sample: MetricSample): void {
    this.recent.push(sample);
    if (this.recent.length > MAX_RECENT) {
      this.recent.shift();
    }
  }
}

function metricKey(name: string, tags?: Record<string, string>): string {
  if (!tags || Object.keys(tags).length === 0) return name;
  const parts = Object.entries(tags)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join(",");
  return `${name}{${parts}}`;
}

const globalMetrics = globalThis as unknown as {
  appMetricsRegistry?: MetricsRegistry;
};

export function getMetricsRegistry(): MetricsRegistry {
  if (!globalMetrics.appMetricsRegistry) {
    globalMetrics.appMetricsRegistry = new MetricsRegistry();
  }
  return globalMetrics.appMetricsRegistry;
}

export const METRIC = {
  PIPELINE_DURATION: "pipeline.duration_ms",
  PUBLISH_DURATION: "publish.duration_ms",
  PUBLISH_RETRIES: "publish.retries",
  GENERATION_DURATION: "generation.duration_ms",
  STORAGE_DURATION: "storage.duration_ms",
} as const;
