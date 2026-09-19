import { NextRequest, NextResponse } from "next/server";
import {
  forbidden,
  getSession,
  resolveSession,
  unauthorized,
} from "@/lib/auth/guard";
import { sendGraphMail, uploadBytesToClientFolder } from "@/lib/onedrive/graph";
import { loadOnedriveTokens } from "@/lib/onedrive/tokens";
import { applyMailVars, devisMailVars } from "@/lib/devis/vars";
import { loadDevisBundle } from "@/lib/devis/prepare";
import { isMissingSchemaError } from "@/lib/supabase/errors";
import { supabaseMarkDevisEnvoye, supabasePatchClient } from "@/lib/store/devis";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  const session = await resolveSession(await getSession());
  if (!session) return unauthorized();
  if (!session.isAdmin) return forbidden();
  let body: { id?: string; to?: string };
  try {
    body = (await request.json()) as { id?: string; to?: string };
  } catch {
    return NextResponse.json({ error: "Requête invalide." }, { status: 400 });
  }
  if (!body.id) return NextResponse.json({ error: "Devis inconnu." }, { status: 400 });
  const tokens = await loadOnedriveTokens();
  if (!tokens?.refresh_token) {
    return NextResponse.json(
      { error: "OneDrive n’est pas connecté. Ouvrez l’onglet OneDrive puis Connecter OneDrive." },
      { status: 400 },
    );
  }
  try {
    const bundle = await loadDevisBundle(body.id);
    const vars = devisMailVars(bundle);
    const to = (body.to ?? bundle.client.email ?? "").trim();
    if (!to.includes("@")) {
      return NextResponse.json(
        { error: "Indiquez un e-mail client sur la fiche, ou un destinataire." },
        { status: 400 },
      );
    }
    await sendGraphMail({
      to: [to],
      subject: applyMailVars(bundle.reglages.mail_sujet, vars),
      text: applyMailVars(bundle.reglages.mail_corps, vars),
      attachments: [
        {
          fileName: bundle.fileName,
          contentType: "application/pdf",
          bytes: bundle.bytes,
        },
      ],
    });
    let onedriveWarning: string | null = null;
    try {
      await uploadBytesToClientFolder({
        nomClient: bundle.client.nom,
        fileName: bundle.fileName,
        bytes: bundle.bytes,
        contentType: "application/pdf",
      });
    } catch (err) {
      onedriveWarning = err instanceof Error ? err.message : "Copie OneDrive impossible.";
    }
    await supabaseMarkDevisEnvoye({
      id: bundle.devis.id,
      to,
      onedrive: onedriveWarning ? null : bundle.fileName,
    });
    if (!bundle.client.lien_dossier_onedrive) {
      try {
        await supabasePatchClient({ id: bundle.client.id, lien_dossier_onedrive: bundle.client.nom });
      } catch {
        // lien optionnel
      }
    }
    return NextResponse.json({ ok: true, to, onedriveWarning });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Envoi impossible.";
    return NextResponse.json(
      { error: isMissingSchemaError(err) ? "Tables devis incomplètes (migration 041/042)." : message },
      { status: 400 },
    );
  }
}
