import { NextResponse } from "next/server";
import { CHANGELOG } from "@/data/changelog";
import { appBuildId } from "@/lib/app-build-id";
import { ensureDeployBackup } from "@/lib/backup/deploy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  void ensureDeployBackup();
  return NextResponse.json(
    { buildId: appBuildId(), changelog: CHANGELOG },
    {
      headers: {
        "Cache-Control": "no-cache, no-store, must-revalidate",
        Pragma: "no-cache",
        Expires: "0",
      },
    },
  );
}
