import { NextResponse } from "next/server";
import { renderRequestSchema } from "@/features/publishing/schedule-service";
import { requireApiEditor } from "@/lib/auth/guards";

export async function POST(request: Request) {
  try {
    await requireApiEditor();
  } catch (error) {
    const code = error instanceof Error ? error.message : "UNAUTHORIZED";
    return NextResponse.json(
      { error: code },
      { status: code === "FORBIDDEN" ? 403 : 401 },
    );
  }

  const body = await request.json();
  const parsed = renderRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "VALIDATION_REJECTED", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  return NextResponse.json({
    jobId: `render_${parsed.data.contentDraftId}_${parsed.data.version}`,
    status: "QUEUED",
  });
}
