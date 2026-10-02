import type { NextRequest } from "next/server";
import { updateSession } from "@/lib/auth/middleware";

/**
 * Next.js 16 Proxy (replaces deprecated middleware.ts convention).
 */
export async function proxy(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/brands/:path*",
    "/templates/:path*",
    "/content/:path*",
    "/calendar/:path*",
    "/integrations/:path*",
    "/api/:path*",
  ],
};
