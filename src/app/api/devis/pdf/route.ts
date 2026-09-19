import { NextRequest, NextResponse } from "next/server";
import {
  forbidden,
  getSession,
  resolveSession,
  unauthorized,
} from "@/lib/auth/guard";
import { applyMailVars, devisMailVars } from "@/lib/devis/vars";
import { loadDevisBundle } from "@/lib/devis/prepare";
import { isMissingSchemaError } from "@/lib/supabase/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  const session = await resolveSession(await getSession());
  if (!session) return unauthorized();
  if (!session.isAdmin) return forbidden();
  let body: { id?: string };
  try {
    body = (await request.json()) as { id?: string };
  } catch {
    return NextResponse.json({ error: "Requête invalide." }, { status: 400 });
  }
  if (!body.id) return NextResponse.json({ error: "Devis inconnu." }, { status: 400 });
  try {
    const bundle = await loadDevisBundle(body.id);
    const vars = devisMailVars(bundle);
    return NextResponse.json({
      fileName: bundle.fileName,
      pdfBase64: Buffer.from(bundle.bytes).toString("base64"),
      to: bundle.client.email?.trim() || "",
      subject: applyMailVars(bundle.reglages.mail_sujet, vars),
      text: applyMailVars(bundle.reglages.mail_corps, vars),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Aperçu impossible.";
    return NextResponse.json(
      { error: isMissingSchemaError(err) ? "Tables devis incomplètes (migration 041/042)." : message },
      { status: 400 },
    );
  }
}
