import { NextRequest, NextResponse } from "next/server";
import { updateChantierOnedriveLink } from "@/lib/onedrive/db";
import { createClientFolder } from "@/lib/onedrive/graph";
import { loadOnedriveTokens } from "@/lib/onedrive/tokens";

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      chantierId?: string;
      nomClient?: string;
    };
    if (!body.chantierId || !body.nomClient?.trim()) {
      return NextResponse.json({ error: "chantierId et nomClient requis." }, { status: 400 });
    }
    const tokens = await loadOnedriveTokens();
    if (!tokens?.refresh_token) {
      return NextResponse.json({ skipped: true, error: "OneDrive n’est pas connecté." });
    }
    const shareUrl = await createClientFolder(body.nomClient.trim());
    try {
      await updateChantierOnedriveLink(body.chantierId, shareUrl);
    } catch {
      // Mode local : le client applique le lien lui-même.
    }
    return NextResponse.json({ shareUrl });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Création du dossier OneDrive impossible.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
