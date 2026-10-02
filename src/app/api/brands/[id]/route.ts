import { NextResponse } from "next/server";
import { requireApiEditor, requireApiUser } from "@/lib/auth/guards";
import { requireRole, getUserRole } from "@/lib/auth/supabase";
import { createBrandService } from "@/server/services/brand-service";

type RouteContext = { params: Promise<{ id: string }> };

function errorResponse(error: unknown) {
  const code = error instanceof Error ? error.message : "UNKNOWN";
  const status =
    code === "FORBIDDEN"
      ? 403
      : code === "UNAUTHORIZED"
        ? 401
        : code === "BRAND_NOT_FOUND"
          ? 404
          : code === "BRAND_SLUG_TAKEN"
            ? 409
            : 400;
  return NextResponse.json({ error: code }, { status });
}

export async function GET(_request: Request, context: RouteContext) {
  try {
    await requireApiUser();
    const { id } = await context.params;
    const data = await createBrandService().getById(id);
    return NextResponse.json({ data });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const user = await requireApiEditor();
    const { id } = await context.params;
    const body = await request.json();
    const data = await createBrandService().update(
      id,
      body,
      getUserRole(user),
    );
    return NextResponse.json({ data });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  try {
    const user = await requireRole(["ADMIN"]);
    const { id } = await context.params;
    await createBrandService().delete(id, getUserRole(user));
    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
