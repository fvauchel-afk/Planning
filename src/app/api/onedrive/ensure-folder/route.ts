import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/guard";
import { updateChantierOnedriveLink } from "@/lib/onedrive/db";
import { createClientFolder } from "@/lib/onedrive/graph";
import { loadOnedriveTokens } from "@/lib/onedrive/tokens";

export async function POST(request: NextRequest) {
  const { response } = await requireAdmin(request);
  if (response) return response;
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
      return NextResponse.json({
        skipped: true,
        error:
          "OneDrive n’est pas connecté. Ouvrez l’onglet OneDrive et cliquez sur « Connecter OneDrive ».",
      });
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
    return NextResponse.json({ skipped: true, error: message });
  }
}
