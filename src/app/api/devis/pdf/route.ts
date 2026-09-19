import { NextRequest, NextResponse } from "next/server";
import {
  forbidden,
  getSession,
  resolveSession,
  unauthorized,
} from "@/lib/auth/guard";
import { devisMailPreview } from "@/lib/devis/mail";
import { previewDevisPdf } from "@/lib/devis/prepare";
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
  if (!body.id) {
    return NextResponse.json({ error: "Devis inconnu." }, { status: 400 });
  }
  try {
    const { devis, client, bytes, fileName } = await previewDevisPdf(body.id);
    const mail = devisMailPreview({ devis, client });
    return NextResponse.json({
      fileName,
      pdfBase64: Buffer.from(bytes).toString("base64"),
      ...mail,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Aperçu impossible.";
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
