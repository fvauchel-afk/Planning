import { NextRequest, NextResponse } from "next/server";
import {
  forbidden,
  getSession,
  resolveSession,
  unauthorized,
} from "@/lib/auth/guard";
import { parseLignesDevis } from "@/lib/devis/lignes";
import { parseStatutDevis, STATUTS_DEVIS } from "@/lib/devis/types";
import { isMissingSchemaError } from "@/lib/supabase/errors";
import {
  supabaseCreateDevis,
  supabaseDeleteDevis,
  supabaseGetClient,
  supabaseGetDevis,
  supabaseListDevis,
  supabasePatchDevis,
} from "@/lib/store/devis";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SQL_HELP =
  "Tables clients/devis absentes. Exécutez supabase/migrations/041_clients_devis.sql dans l’éditeur SQL Supabase.";

function fail(err: unknown, fallback: string, status = 400) {
  const message = err instanceof Error ? err.message : fallback;
  return NextResponse.json(
    { error: isMissingSchemaError(err) ? SQL_HELP : message },
    { status: isMissingSchemaError(err) ? 400 : status },
  );
}

export async function GET(request: NextRequest) {
  const session = await resolveSession(await getSession());
  if (!session) return unauthorized();
  if (!session.isAdmin) return forbidden();
  const id = request.nextUrl.searchParams.get("id")?.trim();
  const clientId = request.nextUrl.searchParams.get("clientId")?.trim();
  try {
    if (id) {
      const devis = await supabaseGetDevis(id);
      if (!devis) return NextResponse.json({ error: "Devis introuvable." }, { status: 404 });
      const client = await supabaseGetClient(devis.client_id);
      return NextResponse.json({ devis, client });
    }
    const rows = await supabaseListDevis(clientId || undefined);
    return NextResponse.json({ rows });
  } catch (err) {
    return fail(err, "Lecture impossible.", 500);
  }
}

export async function POST(request: NextRequest) {
  const session = await resolveSession(await getSession());
  if (!session) return unauthorized();
  if (!session.isAdmin) return forbidden();
  let body: {
    client_id?: string;
    objet?: string;
    date_devis?: string;
    validite_jours?: number;
    tva_pct?: number;
    notes?: string | null;
    lignes?: unknown;
    chantier_id?: string | null;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Requête invalide." }, { status: 400 });
  }
  if (!body.client_id) {
    return NextResponse.json({ error: "Choisissez un client." }, { status: 400 });
  }
  try {
    const id = await supabaseCreateDevis({
      client_id: body.client_id,
      objet: body.objet,
      date_devis: body.date_devis,
      validite_jours: body.validite_jours,
      tva_pct: body.tva_pct,
      notes: body.notes,
      lignes: body.lignes,
      chantier_id: body.chantier_id,
      created_by: session.nom,
    });
    return NextResponse.json({ ok: true, id });
  } catch (err) {
    return fail(err, "Création impossible.");
  }
}

export async function PATCH(request: NextRequest) {
  const session = await resolveSession(await getSession());
  if (!session) return unauthorized();
  if (!session.isAdmin) return forbidden();
  let body: {
    id?: string;
    client_id?: string;
    objet?: string;
    statut?: string;
    date_devis?: string;
    validite_jours?: number;
    tva_pct?: number;
    notes?: string | null;
    lignes?: unknown;
    chantier_id?: string | null;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Requête invalide." }, { status: 400 });
  }
  if (!body.id) {
    return NextResponse.json({ error: "Devis inconnu." }, { status: 400 });
  }
  if (body.statut !== undefined && !(STATUTS_DEVIS as readonly string[]).includes(body.statut)) {
    return NextResponse.json({ error: "Statut inconnu." }, { status: 400 });
  }
  try {
    await supabasePatchDevis({
      id: body.id,
      client_id: body.client_id,
      objet: body.objet,
      statut: body.statut !== undefined ? parseStatutDevis(body.statut) : undefined,
      date_devis: body.date_devis,
      validite_jours: body.validite_jours,
      tva_pct: body.tva_pct,
      notes: body.notes,
      lignes: body.lignes !== undefined ? parseLignesDevis(body.lignes) : undefined,
      chantier_id: body.chantier_id,
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return fail(err, "Enregistrement impossible.");
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
    return NextResponse.json({ error: "Devis inconnu." }, { status: 400 });
  }
  try {
    await supabaseDeleteDevis(body.id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return fail(err, "Suppression impossible.");
  }
}
