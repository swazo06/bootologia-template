import { NextResponse } from "next/server";
import { isMetaPublishingEnabled } from "@/providers/meta";

export async function GET() {
  return NextResponse.json({
    ok: true,
    service: "social-template-automation",
    dryRun: (process.env.DRY_RUN ?? "true") !== "false",
    metaPublishingEnabled: isMetaPublishingEnabled(),
  });
}
