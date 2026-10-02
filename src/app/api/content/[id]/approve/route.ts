import { NextResponse } from "next/server";
import { requireApiAdmin } from "@/lib/auth/guards";
import { approveRequestSchema } from "@/features/publishing/schedule-service";
import {
  createContentWorkflowService,
  WorkflowError,
} from "@/server/services/content-workflow-service";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: RouteContext) {
  let actorId = "admin";
  try {
    const user = await requireApiAdmin();
    actorId = user.id;
  } catch (error) {
    const code = error instanceof Error ? error.message : "UNAUTHORIZED";
    return NextResponse.json(
      { error: code },
      { status: code === "FORBIDDEN" ? 403 : 401 },
    );
  }

  const { id } = await context.params;
  const body = await request.json();
  const parsed = approveRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "VALIDATION_REJECTED", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  try {
    const { draft, approvedAt } = await createContentWorkflowService().approve(
      id,
      parsed.data.expectedVersion,
      actorId,
    );
    return NextResponse.json({
      id: draft.id,
      status: "APPROVED" as const,
      approvedAt,
      version: draft.version,
    });
  } catch (error) {
    const code =
      error instanceof WorkflowError
        ? error.code
        : error instanceof Error
          ? error.message
          : "UNKNOWN";
    const status =
      code === "CONTENT_NOT_FOUND"
        ? 404
        : code === "VERSION_CONFLICT" ||
            code === "INVALID_TRANSITION" ||
            code === "CONTENT_IMMUTABLE"
          ? 409
          : 400;
    return NextResponse.json({ error: code }, { status });
  }
}
