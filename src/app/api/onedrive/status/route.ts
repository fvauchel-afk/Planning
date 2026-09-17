import { NextResponse } from "next/server";
import { probeOnedriveConnection } from "@/lib/onedrive/graph";
import { isMissingSchemaError } from "@/lib/supabase/errors";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

const NO_STORE = { "Cache-Control": "private, no-store, max-age=0" };

export async function GET() {
  try {
    const status = await probeOnedriveConnection();
    return NextResponse.json(status, { headers: NO_STORE });
  } catch (err) {
    if (isMissingSchemaError(err)) {
      return NextResponse.json(
        {
          connected: false,
          expired: false,
          account: null,
          needsMigration: true,
          error:
            "Table onedrive_tokens introuvable. Exécutez supabase/migrations/006_onedrive.sql dans le SQL Editor.",
        },
        { headers: NO_STORE },
      );
    }
    const message = err instanceof Error ? err.message : "Statut OneDrive indisponible.";
    return NextResponse.json(
      { connected: false, expired: false, error: message },
      { status: 500, headers: NO_STORE },
    );
  }
}
