import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiAdmin } from "@/lib/auth/guards";
import {
  getSocialAccountRepository,
  socialAccountToPublic,
  SocialAccountError,
} from "@/server/repositories/social-account-repository";

function errorResponse(error: unknown) {
  if (error instanceof SocialAccountError) {
    const status = error.code === "NOT_FOUND" ? 404 : 400;
    return NextResponse.json({ error: error.code }, { status });
  }
  const code = error instanceof Error ? error.message : "UNKNOWN";
  const status =
    code === "FORBIDDEN" ? 403 : code === "UNAUTHORIZED" ? 401 : 400;
  return NextResponse.json({ error: code }, { status });
}

const refreshSchema = z
  .object({
    accessToken: z.string().min(10).max(4096),
    tokenExpiresAt: z.string().datetime().nullable().optional(),
  })
  .strict();

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: Params) {
  try {
    await requireApiAdmin();
    const { id } = await params;
    const body = refreshSchema.parse(await request.json());
    const updated = await getSocialAccountRepository().updateToken(
      id,
      body.accessToken,
      body.tokenExpiresAt ? new Date(body.tokenExpiresAt) : null,
    );
    return NextResponse.json({ data: socialAccountToPublic(updated) });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(_request: Request, { params }: Params) {
  try {
    await requireApiAdmin();
    const { id } = await params;
    await getSocialAccountRepository().delete(id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
