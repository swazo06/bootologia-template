import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiAdmin } from "@/lib/auth/guards";
import { createOAuthState } from "@/lib/auth/oauth-state";

const startSchema = z
  .object({
    platform: z.enum(["FACEBOOK", "INSTAGRAM"]),
    redirectTo: z.string().min(1).default("/integrations/meta"),
  })
  .strict();

/**
 * Starts Meta OAuth by issuing a signed state + authorize URL.
 * Without META_APP_ID, returns a dry-run URL for local/demo use.
 */
export async function POST(request: Request) {
  try {
    await requireApiAdmin();
    const body = startSchema.parse(await request.json());
    const state = createOAuthState({
      platform: body.platform,
      redirectTo: body.redirectTo,
    });
    const appId = process.env.META_APP_ID?.trim();
    const version = process.env.META_GRAPH_API_VERSION ?? "v21.0";
    const appUrl =
      process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
    const redirectUri = `${appUrl}/api/meta/oauth/callback`;

    if (!appId) {
      return NextResponse.json({
        data: {
          state,
          authorizeUrl: null,
          dryRun: true,
          message:
            "META_APP_ID non configuré — utilisez la connexion manuelle par token.",
        },
      });
    }

    const scopes =
      body.platform === "INSTAGRAM"
        ? "instagram_basic,instagram_content_publish,pages_show_list"
        : "pages_manage_posts,pages_read_engagement,pages_show_list";

    const authorizeUrl = new URL(
      `https://www.facebook.com/${version}/dialog/oauth`,
    );
    authorizeUrl.searchParams.set("client_id", appId);
    authorizeUrl.searchParams.set("redirect_uri", redirectUri);
    authorizeUrl.searchParams.set("state", state);
    authorizeUrl.searchParams.set("scope", scopes);
    authorizeUrl.searchParams.set("response_type", "code");

    return NextResponse.json({
      data: { state, authorizeUrl: authorizeUrl.toString(), dryRun: false },
    });
  } catch (error) {
    const code = error instanceof Error ? error.message : "UNKNOWN";
    const status =
      code === "FORBIDDEN" ? 403 : code === "UNAUTHORIZED" ? 401 : 400;
    return NextResponse.json({ error: code }, { status });
  }
}
