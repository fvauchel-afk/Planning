import { NextRequest, NextResponse } from "next/server";
import {
  forbidden,
  getSession,
  resolveSession,
  unauthorized,
} from "@/lib/auth/guard";
import {
  supabaseDeleteSousTraitant,
  supabaseListSousTraitants,
  supabaseUpsertSousTraitant,
} from "@/lib/store/supabase";
import { isMissingSchemaError } from "@/lib/supabase/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SQL_HELP =
  "Table sous_traitants absente. Exécutez supabase/migrations/025_sous_traitants.sql dans l’éditeur SQL Supabase.";

export async function GET() {
  const session = await resolveSession(await getSession());
  if (!session) return unauthorized();
  if (!session.isAdmin) return forbidden();
  try {
    const rows = await supabaseListSousTraitants();
    return NextResponse.json({ rows });
  } catch (err) {
    if (isMissingSchemaError(err)) {
      return NextResponse.json({ error: SQL_HELP, rows: [] }, { status: 400 });
    }
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Lecture impossible." },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  const session = await resolveSession(await getSession());
  if (!session) return unauthorized();
  if (!session.isAdmin) return forbidden();
  let body: {
    id?: string;
    nom?: string;
    specialite?: string;
    email?: string;
    telephone?: string;
    adresse?: string;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Requête invalide." }, { status: 400 });
  }
  const nom = body.nom?.trim() ?? "";
  const specialite = body.specialite?.trim() ?? "";
  const email = body.email?.trim() ?? "";
  if (!nom || !specialite || !email.includes("@")) {
    return NextResponse.json(
      { error: "Nom, spécialité et e-mail sont obligatoires." },
      { status: 400 },
    );
  }
  try {
    const id = await supabaseUpsertSousTraitant({
      id: body.id,
      nom,
      specialite,
      email,
      telephone: body.telephone,
      adresse: body.adresse,
    });
    return NextResponse.json({ ok: true, id });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Enregistrement impossible.";
    return NextResponse.json(
      { error: isMissingSchemaError(err) ? SQL_HELP : message },
      { status: 400 },
    );
  }
}

export async function DELETE(request: NextRequest) {
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
    return NextResponse.json({ error: "Sous-traitant inconnu." }, { status: 400 });
  }
  try {
    await supabaseDeleteSousTraitant(body.id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Suppression impossible." },
      { status: 400 },
    );
  }
}
