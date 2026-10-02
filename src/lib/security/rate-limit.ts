type Bucket = { count: number; resetAt: number };

/**
 * Simple in-process sliding-window rate limiter (per key).
 * Sufficient for single-instance / Vercel function isolation.
 */
export class RateLimiter {
  private readonly buckets = new Map<string, Bucket>();

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
  ) {}

  check(key: string): { allowed: boolean; remaining: number; retryAfterMs: number } {
    const now = Date.now();
    const current = this.buckets.get(key);
    if (!current || current.resetAt <= now) {
      this.buckets.set(key, { count: 1, resetAt: now + this.windowMs });
      return { allowed: true, remaining: this.limit - 1, retryAfterMs: 0 };
    }
    if (current.count >= this.limit) {
      return {
        allowed: false,
        remaining: 0,
        retryAfterMs: Math.max(0, current.resetAt - now),
      };
    }
    current.count += 1;
    return {
      allowed: true,
      remaining: this.limit - current.count,
      retryAfterMs: 0,
    };
  }

  reset(): void {
    this.buckets.clear();
  }
}

const globalLimiters = globalThis as unknown as {
  apiRateLimiter?: RateLimiter;
};

export function getApiRateLimiter(): RateLimiter {
  if (!globalLimiters.apiRateLimiter) {
    const limit = Number(process.env.API_RATE_LIMIT ?? "120");
    const windowMs = Number(process.env.API_RATE_WINDOW_MS ?? "60000");
    globalLimiters.apiRateLimiter = new RateLimiter(
      Number.isFinite(limit) && limit > 0 ? limit : 120,
      Number.isFinite(windowMs) && windowMs > 0 ? windowMs : 60_000,
    );
  }
  return globalLimiters.apiRateLimiter;
}
