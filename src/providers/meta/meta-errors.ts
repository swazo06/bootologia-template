import { MetaPublishError } from "@/providers/meta/types";

/** Graph API error codes → normalized publish error codes. */
const GRAPH_CODE_MAP: Record<number, string> = {
  190: "TOKEN_PERMANENTLY_INVALID",
  102: "TOKEN_PERMANENTLY_INVALID",
  200: "PERMISSION_DENIED",
  10: "PERMISSION_DENIED",
  100: "VALIDATION_REJECTED",
  368: "ACCOUNT_DISCONNECTED",
};

type GraphErrorBody = {
  error?: {
    message?: string;
    type?: string;
    code?: number;
    error_subcode?: number;
    fbtrace_id?: string;
  };
};

/**
 * Maps Meta Graph / transport errors to MetaPublishError without leaking tokens.
 */
export function mapMetaError(error: unknown): MetaPublishError {
  if (error instanceof MetaPublishError) return error;

  if (error && typeof error === "object") {
    const maybeCode = (error as { code?: unknown }).code;
    if (typeof maybeCode === "string" && maybeCode.length > 0) {
      const message =
        error instanceof Error ? stripSecrets(error.message) : maybeCode;
      return new MetaPublishError(maybeCode, message);
    }

    const body = error as GraphErrorBody;
    const graph = body.error;
    if (graph && typeof graph.code === "number") {
      const mapped =
        GRAPH_CODE_MAP[graph.code] ??
        (graph.error_subcode === 463
          ? "TOKEN_PERMANENTLY_INVALID"
          : "UNKNOWN");
      return new MetaPublishError(
        mapped,
        stripSecrets(graph.message ?? mapped),
      );
    }
  }

  if (error instanceof Error) {
    return new MetaPublishError("UNKNOWN", stripSecrets(error.message));
  }

  return new MetaPublishError("UNKNOWN", "Unknown Meta publish error");
}

function stripSecrets(message: string): string {
  return message
    .replace(/Bearer\s+[A-Za-z0-9\-._~+/]+=*/gi, "Bearer [REDACTED]")
    .replace(/access_token=[^&\s]+/gi, "access_token=[REDACTED]");
}
