import { NextResponse } from "next/server";
import { requireApiEditor, requireApiUser } from "@/lib/auth/guards";
import { getUserRole } from "@/lib/auth/supabase";
import { brandListQuerySchema } from "@/lib/validation/brand";
import { createBrandService } from "@/server/services/brand-service";

function errorResponse(error: unknown) {
  const code = error instanceof Error ? error.message : "UNKNOWN";
  const status =
    code === "FORBIDDEN"
      ? 403
      : code === "UNAUTHORIZED"
        ? 401
        : code === "BRAND_NOT_FOUND"
          ? 404
          : code === "BRAND_SLUG_TAKEN" || code === "VALIDATION_REJECTED"
            ? 409
            : 400;
  return NextResponse.json({ error: code }, { status });
}

export async function GET(request: Request) {
  try {
    await requireApiUser();
    const { searchParams } = new URL(request.url);
    const query = brandListQuerySchema.parse({
      search: searchParams.get("search") ?? "",
      status: searchParams.get("status") ?? "all",
      language: searchParams.get("language") ?? "",
      page: searchParams.get("page") ?? "1",
      pageSize: searchParams.get("pageSize") ?? "20",
    });
    const data = await createBrandService().list(query);
    return NextResponse.json({ data });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireApiEditor();
    const body = await request.json();
    const data = await createBrandService().create(body, getUserRole(user));
    return NextResponse.json({ data }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
