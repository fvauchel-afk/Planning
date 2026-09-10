import { NextRequest, NextResponse } from "next/server";
import { sanitizeOnedriveName } from "@/lib/onedrive/sanitize";
import {
  loadChantierLinkByPhase,
  setReceptionOnedriveErreur,
} from "@/lib/onedrive/db";
import { uploadPngToShareFolder } from "@/lib/onedrive/graph";
import { loadOnedriveTokens } from "@/lib/onedrive/tokens";

function dataUrlToBuffer(dataUrl: string): Buffer {
  const match = dataUrl.match(/^data:image\/png;base64,(.+)$/);
  const b64 = match ? match[1] : dataUrl;
  return Buffer.from(b64, "base64");
}

export async function POST(request: NextRequest) {
  const body = (await request.json()) as {
    phaseId?: string;
    receptionId?: string;
    nomClient?: string;
    nomElement?: string;
    nomSignataire?: string;
    dateIso?: string;
    pngDataUrl?: string;
    lienDossier?: string | null;
  };

  const phaseId = body.phaseId ?? "";
  const receptionId = body.receptionId;
  const fail = async (message: string, status = 500) => {
    try {
      if (phaseId) await setReceptionOnedriveErreur(receptionId, phaseId, message);
    } catch {
      // Ne jamais bloquer la réponse.
    }
    return NextResponse.json({ error: message }, { status });
  };

  try {
    if (!phaseId || !body.pngDataUrl) {
      return NextResponse.json({ error: "phaseId et pngDataUrl requis." }, { status: 400 });
    }
    const tokens = await loadOnedriveTokens();
    if (!tokens?.refresh_token) {
      return fail(
        "OneDrive n’est pas connecté. Envoyez la signature manuellement, puis reconnectez-vous sur /admin/onedrive.",
        409,
      );
    }

    const fromDb = await loadChantierLinkByPhase(phaseId);
    const lien = body.lienDossier || fromDb?.lien || null;
    const nomClient = body.nomClient || fromDb?.nomClient || "Client";
    const nomElement = body.nomElement || fromDb?.nomElement || "element";
    if (!lien) {
      return fail(
        "Aucun dossier OneDrive pour ce chantier. Recréez le lien ou déposez la signature à la main.",
        409,
      );
    }

    const datePart = (body.dateIso || new Date().toISOString()).slice(0, 10);
    const fileName = `reception-${sanitizeOnedriveName(nomElement, "element")}-${datePart}.png`;
    await uploadPngToShareFolder({
      shareUrl: lien,
      fileName,
      pngBytes: dataUrlToBuffer(body.pngDataUrl),
    });
    try {
      await setReceptionOnedriveErreur(receptionId, phaseId, null);
    } catch {
      // Colonne absente tant que 006 n’est pas exécuté.
    }
    return NextResponse.json({ ok: true, fileName, nomClient });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Envoi de la signature vers OneDrive impossible.";
    return fail(
      `${message} Enregistrez le fichier à la main dans le dossier client, puis reconnectez OneDrive si besoin.`,
    );
  }
}
