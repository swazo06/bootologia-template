import { afterEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import {
  isCronAuthorized,
  isCronPath,
  isProtectedPath,
  isPublicApiPath,
  updateSession,
} from "@/lib/auth/middleware";

describe("auth-middleware", () => {
  const previous = { ...process.env };

  afterEach(() => {
    process.env = { ...previous };
  });

  it("classifies protected and public paths", () => {
    expect(isProtectedPath("/dashboard")).toBe(true);
    expect(isProtectedPath("/api/designs/render")).toBe(true);
    expect(isPublicApiPath("/api/health")).toBe(true);
    expect(isPublicApiPath("/api/csrf")).toBe(true);
    expect(isCronPath("/api/cron/publish")).toBe(true);
  });

  it("authorizes cron with bearer secret", () => {
    process.env.CRON_SECRET = "test-cron-secret";
    const ok = new NextRequest("http://localhost/api/cron/publish", {
      headers: { authorization: "Bearer test-cron-secret" },
    });
    const bad = new NextRequest("http://localhost/api/cron/publish", {
      headers: { authorization: "Bearer wrong" },
    });
    expect(isCronAuthorized(ok)).toBe(true);
    expect(isCronAuthorized(bad)).toBe(false);
  });

  it("rejects cron without secret", async () => {
    delete process.env.CRON_SECRET;
    process.env.AUTH_BYPASS = "false";
    const request = new NextRequest("http://localhost/api/cron/publish", {
      method: "POST",
    });
    const response = await updateSession(request);
    expect(response.status).toBe(401);
  });

  it("allows cron with valid secret", async () => {
    process.env.CRON_SECRET = "cron-ok";
    const request = new NextRequest("http://localhost/api/cron/publish", {
      method: "POST",
      headers: { authorization: "Bearer cron-ok" },
    });
    const response = await updateSession(request);
    expect(response.status).toBe(200);
  });

  it("bypasses auth when AUTH_BYPASS is enabled outside production", async () => {
    process.env.AUTH_BYPASS = "true";
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    const request = new NextRequest("http://localhost/dashboard");
    const response = await updateSession(request);
    expect(response.status).toBe(200);
  });

  it("denies protected routes without supabase config when bypass is off", async () => {
    process.env.AUTH_BYPASS = "false";
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    const request = new NextRequest("http://localhost/dashboard");
    const response = await updateSession(request);
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toContain("/login");
  });

  it("returns CSRF_REJECTED for mutating API without token when session path applies", async () => {
    process.env.AUTH_BYPASS = "false";
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    const request = new NextRequest("http://localhost/api/designs/render", {
      method: "POST",
    });
    const response = await updateSession(request);
    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body.error).toBe("CSRF_REJECTED");
  });
});
