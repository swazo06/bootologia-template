const SECRET_PATTERNS = [
  /Bearer\s+[A-Za-z0-9\-._~+/]+=*/gi,
  /access_token["']?\s*[:=]\s*["'][^"']+["']/gi,
  /access_token=[^&\s]+/gi,
  /api[_-]?key["']?\s*[:=]\s*["'][^"']+["']/gi,
  /client_secret["']?\s*[:=]\s*["'][^"']+["']/gi,
  /sk-[A-Za-z0-9]+/gi,
];

const SECRET_KEYS =
  /token|secret|password|authorization|cookie|cookies|apiKey|api_key|x-api-key|client_secret|encryption_key|access_token/i;

export function sanitizeForLogs(value: unknown): unknown {
  if (typeof value === "string") {
    let result = value;
    for (const pattern of SECRET_PATTERNS) {
      result = result.replace(pattern, "[REDACTED]");
    }
    return result;
  }
  if (Array.isArray(value)) {
    return value.map(sanitizeForLogs);
  }
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, nested] of Object.entries(value)) {
      if (SECRET_KEYS.test(key)) {
        out[key] = "[REDACTED]";
      } else {
        out[key] = sanitizeForLogs(nested);
      }
    }
    return out;
  }
  return value;
}

type LogLevel = "debug" | "info" | "warn" | "error";

function write(level: LogLevel, message: string, meta?: unknown): void {
  const payload = {
    level,
    message,
    meta: meta === undefined ? undefined : sanitizeForLogs(meta),
    at: new Date().toISOString(),
  };
  const line = JSON.stringify(payload);
  if (level === "error") {
    console.error(line);
  } else if (level === "warn") {
    console.warn(line);
  } else {
    console.log(line);
  }
}

export const logger = {
  debug: (message: string, meta?: unknown) => write("debug", message, meta),
  info: (message: string, meta?: unknown) => write("info", message, meta),
  warn: (message: string, meta?: unknown) => write("warn", message, meta),
  error: (message: string, meta?: unknown) => write("error", message, meta),
};
