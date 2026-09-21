import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/guard";
import { catchUpOnedriveBatch } from "@/lib/onedrive/catch-up";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 60;

const NO_STORE = { "Cache-Control": "private, no-store, max-age=0" };

export async function POST(request: NextRequest) {
  const { response } = await requireAdmin(request);
  if (response) {
    response.headers.set("Cache-Control", NO_STORE["Cache-Control"]);
    return response;
  }
  try {
    const result = await catchUpOnedriveBatch();
    return NextResponse.json(result, { headers: NO_STORE });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Rattrapage OneDrive impossible.";
    return NextResponse.json(
      {
        folders: 0,
        devis: 0,
        remainingFolders: 0,
        remainingDevis: 0,
        errors: [message],
      },
      { status: 500, headers: NO_STORE },
    );
  }
}
