import { NextResponse } from "next/server";
import { loadOnedriveTokens } from "@/lib/onedrive/tokens";
import { isMissingSchemaError } from "@/lib/supabase/errors";

export async function GET() {
  try {
    const row = await loadOnedriveTokens();
    return NextResponse.json({
      connected: Boolean(row?.refresh_token),
      account: row?.account_label ?? null,
      expiresAt: row?.expires_at ?? null,
      rootCached: Boolean(row?.root_item_id && row?.root_drive_id),
    });
  } catch (err) {
    if (isMissingSchemaError(err)) {
      return NextResponse.json({
        connected: false,
        account: null,
        needsMigration: true,
        error:
          "Table onedrive_tokens introuvable. Exécutez supabase/migrations/006_onedrive.sql dans le SQL Editor.",
      });
    }
    const message = err instanceof Error ? err.message : "Statut OneDrive indisponible.";
    return NextResponse.json({ connected: false, error: message }, { status: 500 });
  }
}
