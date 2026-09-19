import { NextRequest, NextResponse } from "next/server";
import {
  forbidden,
  getSession,
  resolveSession,
  unauthorized,
} from "@/lib/auth/guard";
import { resendConfigured } from "@/lib/bon-commande/mail";
import { devisMailPreview, sendDevisEmail } from "@/lib/devis/mail";
import { previewDevisPdf } from "@/lib/devis/prepare";
import { isMissingSchemaError } from "@/lib/supabase/errors";
import { supabaseMarkDevisEnvoye } from "@/lib/store/devis";

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
  if (!body.id) {
    return NextResponse.json({ error: "Devis inconnu." }, { status: 400 });
  }
  if (!resendConfigured()) {
    return NextResponse.json(
      { error: "Clé Resend absente. Ajoutez RESEND_API_KEY dans les variables Vercel." },
      { status: 400 },
    );
  }
  try {
    const { devis, client, bytes, fileName } = await previewDevisPdf(body.id);
    const mail = devisMailPreview({ devis, client });
    const to = (body.to ?? mail.to).trim();
    if (!to.includes("@")) {
      return NextResponse.json(
        { error: "Indiquez un e-mail client sur la fiche, ou saisissez un destinataire." },
        { status: 400 },
      );
    }
    await sendDevisEmail({
      to,
      subject: mail.subject,
      text: mail.text,
      fileName,
      pdfBytes: bytes,
    });
    await supabaseMarkDevisEnvoye({ id: devis.id, to });
    return NextResponse.json({ ok: true, to, cc: mail.cc });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Envoi impossible.";
    return NextResponse.json(
      {
        error: isMissingSchemaError(err)
          ? "Tables clients/devis absentes. Exécutez supabase/migrations/041_clients_devis.sql."
          : message,
      },
      { status: 400 },
    );
  }
}
