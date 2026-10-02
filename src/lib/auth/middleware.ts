import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import {
  getSupabasePublicConfig,
  isAuthBypassEnabled,
} from "@/lib/auth/config";
import {
  assertCsrf,
  createCsrfToken,
  CSRF_COOKIE,
} from "@/lib/security/csrf";
import { getApiRateLimiter } from "@/lib/security/rate-limit";

function unauthorizedApi(): NextResponse {
  return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
}

function redirectToLogin(request: NextRequest): NextResponse {
  const redirectUrl = request.nextUrl.clone();
  redirectUrl.pathname = "/login";
  redirectUrl.searchParams.set("next", request.nextUrl.pathname);
  return NextResponse.redirect(redirectUrl);
}

function denyProtected(request: NextRequest): NextResponse {
  if (request.nextUrl.pathname.startsWith("/api/")) {
    return unauthorizedApi();
  }
  return redirectToLogin(request);
}

export function isCronAuthorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const header = request.headers.get("authorization");
  return header === `Bearer ${secret}`;
}

export function isProtectedPath(pathname: string): boolean {
  return (
    pathname.startsWith("/dashboard") ||
    pathname.startsWith("/brands") ||
    pathname.startsWith("/templates") ||
    pathname.startsWith("/content") ||
    pathname.startsWith("/calendar") ||
    pathname.startsWith("/integrations") ||
    pathname.startsWith("/api/")
  );
}

export function isPublicApiPath(pathname: string): boolean {
  return (
    pathname.startsWith("/api/health") || pathname.startsWith("/api/csrf")
  );
}

export function isCronPath(pathname: string): boolean {
  return pathname.startsWith("/api/cron");
}

function clientIp(request: NextRequest): string {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "unknown"
  );
}

function withCsrfCookie(response: NextResponse): NextResponse {
  if (!response.cookies.get(CSRF_COOKIE)?.value) {
    response.cookies.set(CSRF_COOKIE, createCsrfToken(), {
      httpOnly: false,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
    });
  }
  return response;
}

export async function updateSession(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  const responseBase = NextResponse.next({ request });

  if (pathname.startsWith("/api/") && !isCronPath(pathname)) {
    const limited = getApiRateLimiter().check(clientIp(request));
    if (!limited.allowed) {
      return NextResponse.json(
        { error: "RATE_LIMITED" },
        {
          status: 429,
          headers: {
            "Retry-After": String(Math.ceil(limited.retryAfterMs / 1000) || 1),
          },
        },
      );
    }
  }

  if (isCronPath(pathname)) {
    if (!isCronAuthorized(request)) {
      return unauthorizedApi();
    }
    return responseBase;
  }

  const mutating =
    request.method !== "GET" &&
    request.method !== "HEAD" &&
    request.method !== "OPTIONS";

  if (
    mutating &&
    pathname.startsWith("/api/") &&
    !isPublicApiPath(pathname) &&
    !isAuthBypassEnabled()
  ) {
    try {
      assertCsrf(request);
    } catch {
      return NextResponse.json({ error: "CSRF_REJECTED" }, { status: 403 });
    }
  }

  if (!isProtectedPath(pathname) || isPublicApiPath(pathname)) {
    return withCsrfCookie(responseBase);
  }

  if (isAuthBypassEnabled()) {
    return withCsrfCookie(responseBase);
  }

  const config = getSupabasePublicConfig();
  if (!config) {
    if (process.env.NODE_ENV === "production") {
      return denyProtected(request);
    }
    return denyProtected(request);
  }

  let response = responseBase;
  const supabase = createServerClient(config.url, config.anon, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return denyProtected(request);
  }

  return withCsrfCookie(response);
}
