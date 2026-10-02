const CSRF_COOKIE = "sta_csrf";
const CSRF_HEADER = "x-csrf-token";

/**
 * Edge-safe CSRF (Web Crypto). Double-submit cookie === header.
 * No Node `crypto` — safe for Next.js middleware (Edge runtime).
 */
export function createCsrfToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export function verifyCsrfToken(token: string | null | undefined): boolean {
  return (
    typeof token === "string" &&
    token.length === 64 &&
    /^[0-9a-f]+$/i.test(token)
  );
}

/**
 * Double-submit CSRF: cookie value must match header value.
 */
export function assertCsrf(request: {
  headers: Headers;
  cookies: { get(name: string): { value: string } | undefined };
}): void {
  if (process.env.AUTH_BYPASS === "true") return;
  if (process.env.CSRF_DISABLED === "true") return;

  const header = request.headers.get(CSRF_HEADER);
  const cookie = request.cookies.get(CSRF_COOKIE)?.value;
  if (
    !header ||
    !cookie ||
    header !== cookie ||
    !verifyCsrfToken(header)
  ) {
    throw new Error("CSRF_REJECTED");
  }
}

export { CSRF_COOKIE, CSRF_HEADER };
