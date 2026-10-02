import { NextResponse } from "next/server";
import { requireApiAdmin } from "@/lib/auth/guards";
import { getMetricsRegistry } from "@/lib/metrics/registry";
import { isMetaPublishingEnabled } from "@/providers/meta";

export async function GET() {
  try {
    await requireApiAdmin();
    return NextResponse.json({
      ok: true,
      metaPublishingEnabled: isMetaPublishingEnabled(),
      dryRun: (process.env.DRY_RUN ?? "true") !== "false",
      metrics: getMetricsRegistry().snapshot(),
    });
  } catch (error) {
    const code = error instanceof Error ? error.message : "UNKNOWN";
    const status =
      code === "FORBIDDEN" ? 403 : code === "UNAUTHORIZED" ? 401 : 400;
    return NextResponse.json({ error: code }, { status });
  }
}
