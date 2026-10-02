import { mapMetaError } from "@/providers/meta/meta-errors";
import { MetaPublishError } from "@/providers/meta/types";
import { logger } from "@/lib/logging/logger";

export type GraphRequestOptions = {
  path: string;
  method?: "GET" | "POST" | "DELETE";
  query?: Record<string, string | number | boolean | undefined>;
  body?: Record<string, unknown>;
  accessToken: string;
  timeoutMs?: number;
};

export type MetaGraphClient = {
  request<T = Record<string, unknown>>(
    options: GraphRequestOptions,
  ): Promise<T>;
};

function graphBaseUrl(): string {
  const version = process.env.META_GRAPH_API_VERSION ?? "v21.0";
  return `https://graph.facebook.com/${version}`;
}

function defaultTimeoutMs(): number {
  const raw = Number(process.env.META_GRAPH_TIMEOUT_MS ?? "30000");
  return Number.isFinite(raw) && raw > 0 ? raw : 30_000;
}

function buildUrl(
  path: string,
  query: Record<string, string | number | boolean | undefined>,
): string {
  const url = new URL(
    path.startsWith("http")
      ? path
      : `${graphBaseUrl()}/${path.replace(/^\//, "")}`,
  );
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined) continue;
    url.searchParams.set(key, String(value));
  }
  return url.toString();
}

/**
 * Low-level Meta Graph HTTP client.
 * Token is sent via Authorization header only — never logged.
 */
export class FetchMetaGraphClient implements MetaGraphClient {
  constructor(
    private readonly fetchImpl: typeof fetch = globalThis.fetch.bind(
      globalThis,
    ),
  ) {}

  async request<T = Record<string, unknown>>(
    options: GraphRequestOptions,
  ): Promise<T> {
    const timeoutMs = options.timeoutMs ?? defaultTimeoutMs();
    const method = options.method ?? "GET";
    const url = buildUrl(options.path, options.query ?? {});
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    logger.info("meta.graph.request", {
      method,
      url,
      timeoutMs,
    });

    try {
      const headers: Record<string, string> = {
        Authorization: `Bearer ${options.accessToken}`,
      };
      const init: RequestInit = {
        method,
        signal: controller.signal,
        headers,
      };
      if (method !== "GET" && options.body) {
        headers["Content-Type"] = "application/json";
        init.body = JSON.stringify(options.body);
      }

      const response = await this.fetchImpl(url, init);
      const json = (await response.json().catch(() => ({}))) as Record<
        string,
        unknown
      >;

      if (!response.ok || json.error) {
        throw mapMetaError(json);
      }

      return json as T;
    } catch (error) {
      if (error instanceof MetaPublishError) throw error;
      if (error instanceof Error && error.name === "AbortError") {
        throw new MetaPublishError("TIMEOUT", "Meta Graph request timed out");
      }
      throw mapMetaError(error);
    } finally {
      clearTimeout(timer);
    }
  }
}

export function createMetaGraphClient(
  fetchImpl?: typeof fetch,
): MetaGraphClient {
  return new FetchMetaGraphClient(fetchImpl);
}
