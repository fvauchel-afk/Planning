import { NextResponse } from "next/server";
import { probeOnedriveConnection } from "@/lib/onedrive/graph";
import { isMissingSchemaError } from "@/lib/supabase/errors";

export async function GET() {
  try {
    const status = await probeOnedriveConnection();
    return NextResponse.json(status);
  } catch (err) {
    if (isMissingSchemaError(err)) {
      return NextResponse.json({
        connected: false,
        expired: false,
        account: null,
        needsMigration: true,
        error:
          "Table onedrive_tokens introuvable. Exécutez supabase/migrations/006_onedrive.sql dans le SQL Editor.",
      });
    }
    const message = err instanceof Error ? err.message : "Statut OneDrive indisponible.";
    return NextResponse.json(
      { connected: false, expired: false, error: message },
      { status: 500 },
    );
  }
}
