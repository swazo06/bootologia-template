import { NextResponse } from "next/server";
import { requireApiEditor } from "@/lib/auth/guards";
import {
  createContentWorkflowService,
  WorkflowError,
} from "@/server/services/content-workflow-service";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(_request: Request, context: RouteContext) {
  try {
    await requireApiEditor();
  } catch (error) {
    const code = error instanceof Error ? error.message : "UNAUTHORIZED";
    return NextResponse.json(
      { error: code },
      { status: code === "FORBIDDEN" ? 403 : 401 },
    );
  }

  const { id } = await context.params;

  try {
    const draft = await createContentWorkflowService().submitForReview(id);
    return NextResponse.json({
      id: draft.id,
      status: draft.status,
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
