import { NextRequest, NextResponse } from "next/server";
import {
  forbidden,
  getSession,
  resolveSession,
  unauthorized,
} from "@/lib/auth/guard";
import { canGenerateBonCommande } from "@/lib/bon-commande/active-phase";
import {
  formatLignesBonCommandeText,
  normalizeLignesBonCommande,
  parseLignesBonCommande,
} from "@/lib/bon-commande/lignes";
import { BON_COMMANDE_CC, sendBonCommandeEmail } from "@/lib/bon-commande/mail";
import { buildBonCommandePdf } from "@/lib/bon-commande/pdf";
import { FINITION_LAQUAGE_LABELS } from "@/lib/thermolaquage";
import { applyBonCommandeDelay } from "@/lib/engine/phase-chain";
import { phaseIdsToConfirmAfterBonCommande } from "@/lib/dates-estimatives";
import { todayIso } from "@/lib/engine/slots";
import {
  createClientFolder,
  uploadBytesToShareFolder,
} from "@/lib/onedrive/graph";
import { updateChantierOnedriveLink } from "@/lib/onedrive/db";
import {
  fetchSupabaseSnapshot,
  invalidateSupabaseSnapshotCache,
  supabaseApplyPhaseEdits,
  supabaseListSousTraitants,
  supabaseMarkBonCommande,
  supabaseConfirmPhaseDates,
  supabasePatchChantier,
} from "@/lib/store/supabase";
import { formatIsoFr } from "@/lib/dates";
import {
  DATABASE_UNAVAILABLE_MESSAGE,
  isConnectivityError,
  wrapSupabaseError,
} from "@/lib/supabase/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

type Body = {
  chantierId?: string;
  sousTraitantId?: string;
  confirm?: boolean;
  lignes?: unknown;
};

async function prepare(
  chantierId: string,
  sousTraitantId: string,
  lignesRaw: unknown,
) {
  const snapshot = await fetchSupabaseSnapshot();
  const chantier = snapshot.chantiers.find((item) => item.id === chantierId);
  if (!chantier) throw new Error("Chantier introuvable.");
  if (!canGenerateBonCommande(snapshot, chantierId)) {
    throw new Error(
      "Le bon de commande s’envoie pour un chantier qui a du thermolaquage / de la galvanisation.",
    );
  }
  const sousTraitants = snapshot.sousTraitants?.length
    ? snapshot.sousTraitants
    : await supabaseListSousTraitants();
  const sousTraitant = sousTraitants.find((item) => item.id === sousTraitantId);
  if (!sousTraitant) throw new Error("Choisissez un sous-traitant enregistré.");
  const elements = snapshot.elements.filter(
    (item) => item.chantier_id === chantierId,
  );
  const elementIds = new Set(elements.map((item) => item.id));
  const fabrication =
    snapshot.phases.find(
      (item) =>
        elementIds.has(item.element_id) && item.type_phase === "fabrication",
    ) ?? null;
  const dateDocument =
    fabrication?.date_debut || todayIso();
  const lignes = normalizeLignesBonCommande(parseLignesBonCommande(lignesRaw));
  if (!lignes.length) {
    throw new Error(
      "Ajoutez au moins une pièce (quantité et descriptif) avant de générer le bon.",
    );
  }
  const pdf = await buildBonCommandePdf({
    chantier,
    lignes,
    fabrication,
    sousTraitant,
    dateDocument,
  });
  const delayDays = chantier.delai_sous_traitance_jours || 5;
  const sendDate = todayIso();
  const delay = applyBonCommandeDelay(
    snapshot,
    chantierId,
    sendDate,
    delayDays,
  );
  return {
    snapshot,
    chantier,
    sousTraitant,
    pdf,
    lignes,
    dateDocument,
    sendDate,
    delay,
  };
}

export async function POST(request: NextRequest) {
  const session = await resolveSession(await getSession());
  if (!session) return unauthorized();
  if (!session.isAdmin) return forbidden();
  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Requête invalide." }, { status: 400 });
  }
  if (!body.chantierId || !body.sousTraitantId) {
    return NextResponse.json(
      { error: "Chantier ou sous-traitant manquant." },
      { status: 400 },
    );
  }
  try {
    const prepared = await prepare(
      body.chantierId,
      body.sousTraitantId,
      body.lignes,
    );
    const {
      chantier,
      sousTraitant,
      pdf,
      lignes,
      dateDocument,
      sendDate,
      delay,
    } = prepared;
    const subject = `Bon de commande — ${chantier.nom_client} — ${sousTraitant.specialite}`;
    const text = [
      `Bon de commande Ferronnerie Vauchel / La Métallerie du Sud.`,
      `Chantier : ${chantier.nom_client}`,
      chantier.adresse ? `Adresse : ${chantier.adresse}` : "",
      chantier.couleur_ral?.trim()
        ? `Couleur RAL : ${chantier.couleur_ral.trim()}`
        : "",
      chantier.finition
        ? `Finition : ${FINITION_LAQUAGE_LABELS[chantier.finition]}`
        : "",
      `Départ fabrication prévu : ${formatIsoFr(dateDocument)}`,
      `Sous-traitant : ${sousTraitant.nom} (${sousTraitant.specialite})`,
      "",
      "Pièces :",
      formatLignesBonCommandeText(lignes),
      "",
      `Délai officiel : 5 jours ouvrés à compter de l’envoi (${formatIsoFr(sendDate)}).`,
    ]
      .filter(Boolean)
      .join("\n");

    await supabasePatchChantier({
      id: chantier.id,
      lignes_bon_commande: lignes,
    });

    if (!body.confirm) {
      return NextResponse.json({
        preview: true,
        fileName: pdf.fileName,
        pdfBase64: Buffer.from(pdf.bytes).toString("base64"),
        to: sousTraitant.email,
        cc: BON_COMMANDE_CC,
        subject,
        text,
        dateDocument,
        sendDate,
      });
    }

    await sendBonCommandeEmail({
      to: sousTraitant.email,
      subject,
      text,
      fileName: pdf.fileName,
      pdfBytes: pdf.bytes,
    });

    let onedriveWarning: string | undefined;
    try {
      let shareUrl = chantier.lien_dossier_onedrive;
      if (!shareUrl) {
        shareUrl = await createClientFolder(chantier.nom_client);
        await updateChantierOnedriveLink(chantier.id, shareUrl);
      }
      await uploadBytesToShareFolder({
        shareUrl,
        fileName: pdf.fileName,
        bytes: pdf.bytes,
        contentType: "application/pdf",
        folderName: chantier.nom_client,
      });
    } catch (err) {
      onedriveWarning =
        err instanceof Error
          ? err.message
          : "Copie OneDrive impossible.";
    }

    if (delay.patches.length || delay.inserts.length) {
      await supabaseApplyPhaseEdits({
        patches: delay.patches,
        inserts: delay.inserts,
      });
    }
    await supabaseMarkBonCommande({
      chantierId: chantier.id,
      sousTraitantId: sousTraitant.id,
      sendDate,
    });
    const after = await fetchSupabaseSnapshot();
    const confirmIds = phaseIdsToConfirmAfterBonCommande(after, chantier.id);
    if (confirmIds.length) {
      await supabaseConfirmPhaseDates(after, confirmIds);
    }
    invalidateSupabaseSnapshotCache();
    return NextResponse.json({
      ok: true,
      onedriveWarning,
    });
  } catch (err) {
    const wrapped = wrapSupabaseError(err);
    const transient =
      isConnectivityError(err) ||
      wrapped.message === DATABASE_UNAVAILABLE_MESSAGE;
    return NextResponse.json(
      {
        error: transient
          ? DATABASE_UNAVAILABLE_MESSAGE
          : wrapped.message || "Bon de commande impossible.",
      },
      { status: transient ? 503 : 400 },
    );
  }
}
