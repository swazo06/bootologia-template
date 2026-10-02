import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth/guards";
import { createTemplateService } from "@/server/services/template-service";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: RouteContext) {
  try {
    await requireApiUser();
    const { id } = await context.params;
    const templates = await createTemplateService().listByBrandId(id);
    return NextResponse.json({ data: templates });
  } catch (error) {
    const code = error instanceof Error ? error.message : "UNKNOWN";
    const status =
      code === "UNAUTHORIZED"
        ? 401
        : code === "BRAND_NOT_FOUND" || code === "BRAND_INACTIVE"
          ? 404
          : 400;
    return NextResponse.json({ error: code }, { status });
  }
}
