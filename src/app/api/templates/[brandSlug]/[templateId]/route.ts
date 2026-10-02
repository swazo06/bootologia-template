import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth/guards";
import { createTemplateService } from "@/server/services/template-service";

type RouteContext = {
  params: Promise<{ brandSlug: string; templateId: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  try {
    await requireApiUser();
    const { brandSlug, templateId } = await context.params;
    const usable = await createTemplateService().getUsable(
      brandSlug,
      templateId,
    );
    return NextResponse.json({
      data: {
        record: usable.record,
        config: usable.loaded.config,
        brandSlug: usable.loaded.brandSlug,
      },
    });
  } catch (error) {
    const code = error instanceof Error ? error.message : "UNKNOWN";
    const status =
      code === "UNAUTHORIZED"
        ? 401
        : code === "TEMPLATE_NOT_USABLE" ||
            code === "TEMPLATE_BRAND_MISMATCH" ||
            code === "BRAND_INACTIVE"
          ? 409
          : code === "BRAND_NOT_FOUND"
            ? 404
            : 400;
    return NextResponse.json({ error: code }, { status });
  }
}
