import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/guard";
import { refreshOnedriveQuietly } from "@/lib/onedrive/tokens";

/** Ping après login : rafraîchit OneDrive sans bloquer l’UI (le client n’attend pas). */
export async function POST(request: NextRequest) {
  const { response } = await requireSession(request);
  if (response) return new NextResponse(null, { status: 204 });
  await refreshOnedriveQuietly();
  return new NextResponse(null, { status: 204 });
}
