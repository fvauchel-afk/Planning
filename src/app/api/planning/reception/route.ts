import { NextRequest, NextResponse } from "next/server";
import {
  forbidden,
  getSession,
  resolveSession,
  unauthorized,
} from "@/lib/auth/guard";
import { idsEqual } from "@/lib/auth/ids";
import { todayIso } from "@/lib/engine/slots";
import {
  createClientFolder,
  uploadBytesToShareFolder,
} from "@/lib/onedrive/graph";
import {
  setReceptionOnedriveErreur,
  updateChantierOnedriveLink,
} from "@/lib/onedrive/db";
import { buildReceptionPdf, pngDataUrlToBytes } from "@/lib/reception/pdf";
import {
  fetchSupabaseSnapshot,
  invalidateSupabaseSnapshotCache,
  supabaseCreateReception,
} from "@/lib/store/supabase";
import {
  DATABASE_UNAVAILABLE_MESSAGE,
  wrapSupabaseError,
} from "@/lib/supabase/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

type Body = {
  phaseId?: string;
  nomSignataire?: string;
  imageSignature?: string;
  confirm?: boolean;
};

export async function POST(request: NextRequest) {
  const session = await resolveSession(await getSession());
  if (!session) return unauthorized();

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Requête invalide." }, { status: 400 });
  }
  const phaseId = body.phaseId ?? "";
  const nomSignataire = body.nomSignataire?.trim() ?? "";
  const imageSignature = body.imageSignature ?? "";
  if (!phaseId || !nomSignataire || !imageSignature) {
    return NextResponse.json(
      { error: "Phase, nom du signataire et signature sont requis." },
      { status: 400 },
    );
  }

  try {
    const snapshot = await fetchSupabaseSnapshot();
    const phase = snapshot.phases.find((item) => item.id === phaseId);
    if (
      !phase ||
      (phase.type_phase !== "pose" && phase.type_phase !== "livraison")
    ) {
      return forbidden("Signature impossible pour cette phase.");
    }
    if (!session.isAdmin && !idsEqual(phase.employe_id, session.employeeId)) {
      return forbidden("Signature impossible pour cette phase.");
    }
    const existing = snapshot.receptions.find((row) => row.phase_id === phaseId);
    if (existing && body.confirm) {
      return NextResponse.json(
        { error: "Une réception est déjà enregistrée pour cette phase." },
        { status: 400 },
      );
    }
    const element = snapshot.elements.find((item) => item.id === phase.element_id);
    const chantier = snapshot.chantiers.find(
      (item) => item.id === element?.chantier_id,
    );
    const salarie = snapshot.employees.find((item) => item.id === phase.employe_id);
    const kind = phase.type_phase === "livraison" ? "livraison" : "reception";
    const dateDocument = phase.date_debut || todayIso();
    const pdf = await buildReceptionPdf({
      kind,
      nomClient: chantier?.nom_client ?? "Client",
      nomElement: element?.nom_element ?? "élément",
      adresse:
        chantier?.adresse_livraison?.trim() || chantier?.adresse || "",
      nomSignataire,
      nomSalarie: salarie?.nom,
      dateDocument,
      signaturePng: pngDataUrlToBytes(imageSignature),
    });
    const pdfBase64 = Buffer.from(pdf.bytes).toString("base64");
    if (!body.confirm) {
      return NextResponse.json({
        fileName: pdf.fileName,
        pdfBase64,
        subject:
          kind === "livraison"
            ? `Bon de livraison — ${chantier?.nom_client ?? "chantier"}`
            : `Réception de chantier — ${chantier?.nom_client ?? "chantier"}`,
      });
    }

    const receptionId = await supabaseCreateReception({
      phase_id: phaseId,
      nom_signataire: nomSignataire,
      image_signature: imageSignature,
    });

    let onedriveWarning: string | undefined;
    try {
      let shareUrl = chantier?.lien_dossier_onedrive ?? null;
      if (!shareUrl && chantier) {
        shareUrl = await createClientFolder(chantier.nom_client);
        await updateChantierOnedriveLink(chantier.id, shareUrl);
      }
      if (!shareUrl) {
        throw new Error("Aucun dossier OneDrive pour ce chantier.");
      }
      await uploadBytesToShareFolder({
        shareUrl,
        fileName: pdf.fileName,
        bytes: pdf.bytes,
        contentType: "application/pdf",
      });
      await setReceptionOnedriveErreur(receptionId, phaseId, null);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Copie OneDrive impossible.";
      onedriveWarning = message;
      try {
        await setReceptionOnedriveErreur(receptionId, phaseId, message);
      } catch {
        // colonne optionnelle
      }
    }

    invalidateSupabaseSnapshotCache();
    return NextResponse.json({
      ok: true,
      fileName: pdf.fileName,
      pdfBase64,
      onedriveWarning,
    });
  } catch (err) {
    const wrapped = wrapSupabaseError(err);
    return NextResponse.json(
      {
        error: wrapped.message || DATABASE_UNAVAILABLE_MESSAGE,
      },
      { status: 400 },
    );
  }
}
