import { NextResponse } from "next/server";
import { requireApiAdmin } from "@/lib/auth/guards";
import { socialAccountCreateSchema } from "@/lib/validation/social-account";
import {
  getSocialAccountRepository,
  socialAccountToPublic,
  SocialAccountError,
} from "@/server/repositories/social-account-repository";

function errorResponse(error: unknown) {
  if (error instanceof SocialAccountError) {
    const status =
      error.code === "NOT_FOUND"
        ? 404
        : error.code === "DUPLICATE"
          ? 409
          : 400;
    return NextResponse.json({ error: error.code }, { status });
  }
  const code = error instanceof Error ? error.message : "UNKNOWN";
  const status =
    code === "FORBIDDEN"
      ? 403
      : code === "UNAUTHORIZED"
        ? 401
        : 400;
  return NextResponse.json({ error: code }, { status });
}

export async function GET() {
  try {
    await requireApiAdmin();
    const rows = await getSocialAccountRepository().list();
    return NextResponse.json({
      data: rows.map(socialAccountToPublic),
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    await requireApiAdmin();
    const body = socialAccountCreateSchema.parse(await request.json());
    const created = await getSocialAccountRepository().create({
      platform: body.platform,
      externalId: body.externalId,
      displayName: body.displayName,
      accessToken: body.accessToken,
      tokenExpiresAt: body.tokenExpiresAt
        ? new Date(body.tokenExpiresAt)
        : null,
      brandId: body.brandId ?? null,
      status: body.status,
    });
    return NextResponse.json(
      { data: socialAccountToPublic(created) },
      { status: 201 },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
