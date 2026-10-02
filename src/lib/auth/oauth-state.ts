import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Signed OAuth `state` parameter (spec: validate OAuth state).
 * Used when initiating Meta/Supabase OAuth redirects.
 */
export function createOAuthState(payload: Record<string, string> = {}): string {
  const nonce = randomBytes(16).toString("hex");
  const body = Buffer.from(
    JSON.stringify({ ...payload, nonce, ts: Date.now() }),
    "utf8",
  ).toString("base64url");
  const sig = sign(body);
  return `${body}.${sig}`;
}

export function validateOAuthState(
  state: string | null | undefined,
  options?: { maxAgeMs?: number },
): { ok: true; payload: Record<string, unknown> } | { ok: false; reason: string } {
  if (!state || !state.includes(".")) {
    return { ok: false, reason: "MISSING_STATE" };
  }
  const [body, sig] = state.split(".");
  if (!body || !sig) return { ok: false, reason: "MALFORMED_STATE" };
  const expected = sign(body);
  try {
    const a = Buffer.from(sig, "utf8");
    const b = Buffer.from(expected, "utf8");
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      return { ok: false, reason: "INVALID_SIGNATURE" };
    }
  } catch {
    return { ok: false, reason: "INVALID_SIGNATURE" };
  }

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(
      Buffer.from(body, "base64url").toString("utf8"),
    ) as Record<string, unknown>;
  } catch {
    return { ok: false, reason: "INVALID_PAYLOAD" };
  }

  const maxAge = options?.maxAgeMs ?? 10 * 60_000;
  const ts = typeof payload.ts === "number" ? payload.ts : 0;
  if (!ts || Date.now() - ts > maxAge) {
    return { ok: false, reason: "EXPIRED_STATE" };
  }
  return { ok: true, payload };
}

function sign(body: string): string {
  const secret =
    process.env.OAUTH_STATE_SECRET ||
    process.env.ENCRYPTION_KEY ||
    "dev-oauth-state-secret-32chars!!";
  return createHmac("sha256", secret).update(body).digest("base64url");
}
