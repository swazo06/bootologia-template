import { describe, expect, it } from "vitest";
import {
  assertPublicHttpUrl,
  isPublicHttpUrl,
  UrlSafetyError,
} from "@/lib/security/ssrf";
import {
  createCsrfToken,
  verifyCsrfToken,
} from "@/lib/security/csrf";
import { RateLimiter } from "@/lib/security/rate-limit";
import {
  createOAuthState,
  validateOAuthState,
} from "@/lib/auth/oauth-state";

describe("security controls", () => {
  it("blocks SSRF targets", () => {
    expect(isPublicHttpUrl("https://cdn.example.com/a.png")).toBe(true);
    expect(() => assertPublicHttpUrl("http://127.0.0.1/x")).toThrow(
      UrlSafetyError,
    );
    expect(() => assertPublicHttpUrl("http://10.0.0.5/x")).toThrow(
      UrlSafetyError,
    );
    expect(() => assertPublicHttpUrl("http://169.254.169.254/latest")).toThrow(
      UrlSafetyError,
    );
    expect(() => assertPublicHttpUrl("http://192.168.1.1/x")).toThrow(
      UrlSafetyError,
    );
    expect(() => assertPublicHttpUrl("file:///etc/passwd")).toThrow(
      UrlSafetyError,
    );
  });

  it("creates and verifies CSRF tokens", () => {
    const token = createCsrfToken();
    expect(verifyCsrfToken(token)).toBe(true);
    expect(verifyCsrfToken("bad")).toBe(false);
    expect(verifyCsrfToken("gg".repeat(32))).toBe(false);
  });

  it("rate limits after threshold", () => {
    const limiter = new RateLimiter(3, 60_000);
    expect(limiter.check("ip").allowed).toBe(true);
    expect(limiter.check("ip").allowed).toBe(true);
    expect(limiter.check("ip").allowed).toBe(true);
    expect(limiter.check("ip").allowed).toBe(false);
  });

  it("validates OAuth state signatures and expiry", () => {
    const state = createOAuthState({ next: "/dashboard" });
    const ok = validateOAuthState(state);
    expect(ok.ok).toBe(true);
    expect(validateOAuthState("tampered.payload")).toMatchObject({
      ok: false,
    });
    expect(validateOAuthState(null)).toMatchObject({ ok: false });
  });
});
