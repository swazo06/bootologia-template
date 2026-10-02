import { NextResponse } from "next/server";
import { validateOAuthState } from "@/lib/auth/oauth-state";
import { getSocialAccountRepository } from "@/server/repositories/social-account-repository";

/**
 * OAuth callback. With real Meta app credentials, exchanges code for token.
 * In local/demo without secrets, stores a placeholder connected account from state.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const state = url.searchParams.get("state");
  const code = url.searchParams.get("code");
  const error = url.searchParams.get("error");

  const validated = validateOAuthState(state);
  const redirectTo =
    validated.ok && typeof validated.payload.redirectTo === "string"
      ? validated.payload.redirectTo
      : "/integrations/meta";

  if (error || !validated.ok) {
    return NextResponse.redirect(
      new URL(
        `${redirectTo}?oauth=error&reason=${encodeURIComponent(error ?? validated.ok ? "unknown" : validated.reason)}`,
        request.url,
      ),
    );
  }

  const platform =
    validated.payload.platform === "INSTAGRAM" ? "INSTAGRAM" : "FACEBOOK";

  try {
    if (code && process.env.META_APP_ID && process.env.META_APP_SECRET) {
      // Real token exchange lands here in production Meta apps.
      // Until then, refuse silent success without an exchange implementation.
      return NextResponse.redirect(
        new URL(
          `${redirectTo}?oauth=error&reason=TOKEN_EXCHANGE_NOT_CONFIGURED`,
          request.url,
        ),
      );
    }

    // Demo path: register a connected account marker after valid state.
    await getSocialAccountRepository().create({
      platform,
      externalId: `oauth_${platform.toLowerCase()}_${Date.now()}`,
      displayName: `Meta ${platform} (OAuth demo)`,
      accessToken: `oauth_demo_token_${crypto.randomUUID().replace(/-/g, "")}`,
      status: "CONNECTED",
    });

    return NextResponse.redirect(
      new URL(`${redirectTo}?oauth=connected`, request.url),
    );
  } catch {
    return NextResponse.redirect(
      new URL(`${redirectTo}?oauth=error&reason=CONNECT_FAILED`, request.url),
    );
  }
}
