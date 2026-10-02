import { NextResponse } from "next/server";
import { createCsrfToken, CSRF_COOKIE } from "@/lib/security/csrf";

/** Issue a CSRF token cookie + body for double-submit protection. */
export async function GET() {
  const token = createCsrfToken();
  const response = NextResponse.json({ csrfToken: token });
  response.cookies.set(CSRF_COOKIE, token, {
    httpOnly: false,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
  });
  return response;
}
