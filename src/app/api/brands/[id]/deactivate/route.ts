import { NextResponse } from "next/server";
import { requireApiEditor } from "@/lib/auth/guards";
import { createBrandService } from "@/server/services/brand-service";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(_request: Request, context: RouteContext) {
  try {
    await requireApiEditor();
    const { id } = await context.params;
    const data = await createBrandService().deactivate(id);
    return NextResponse.json({ data });
  } catch (error) {
    const code = error instanceof Error ? error.message : "UNKNOWN";
    const status =
      code === "FORBIDDEN"
        ? 403
        : code === "UNAUTHORIZED"
          ? 401
          : code === "BRAND_NOT_FOUND"
            ? 404
            : 400;
    return NextResponse.json({ error: code }, { status });
  }
}
