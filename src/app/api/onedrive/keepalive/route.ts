import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/guard";
import { refreshOnedriveQuietly } from "@/lib/onedrive/tokens";

const NO_STORE = { "Cache-Control": "private, no-store, max-age=0" };

function empty() {
  return new NextResponse(null, { status: 204, headers: NO_STORE });
}

/** Ping après login : rafraîchit OneDrive sans bloquer l’UI (le client n’attend pas). */
export async function POST(request: NextRequest) {
  const { response } = await requireSession(request);
  if (response) return empty();
  await refreshOnedriveQuietly();
  return empty();
}

/** Aucune redirection OAuth, même si un GET est préchargé. */
export async function GET() {
  return empty();
}
