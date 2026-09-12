import { NextResponse } from "next/server";
import { appBuildId } from "@/lib/app-build-id";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(
    { buildId: appBuildId() },
    {
      headers: {
        "Cache-Control": "no-cache, no-store, must-revalidate",
      },
    },
  );
}
