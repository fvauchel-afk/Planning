import { NextRequest, NextResponse } from "next/server";
import {
  forbidden,
  getSession,
  resolveSession,
  unauthorized,
} from "@/lib/auth/guard";
import { parseLignesDevis } from "@/lib/devis/lignes";
import { parseStatutDevis, parseTypeFacturation, STATUTS_DEVIS } from "@/lib/devis/types";
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
  "Tables devis incomplètes. Exécutez supabase/migrations/041_clients_devis.sql puis 042_devis_reglages_entreprise.sql.";

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
    return NextResponse.json({ rows: await supabaseListDevis(clientId || undefined) });
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
    validite_jours?: number;
    notes?: string | null;
    lignes?: unknown;
    type_facturation?: string;
    opt_adresse_livraison?: boolean;
    opt_siren?: boolean;
    opt_tva_intra?: boolean;
    opt_conditions?: boolean;
    opt_signature?: boolean;
    opt_intitule?: boolean;
    opt_champ_libre?: boolean;
    opt_remise?: boolean;
    intitule_document?: string | null;
    remise?: { type: "pourcentage" | "montant"; valeur: number } | null;
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
      validite_jours: body.validite_jours,
      notes: body.notes,
      lignes: body.lignes,
      created_by: session.nom,
      type_facturation:
        body.type_facturation !== undefined
          ? parseTypeFacturation(body.type_facturation)
          : undefined,
      opt_adresse_livraison: body.opt_adresse_livraison,
      opt_siren: body.opt_siren,
      opt_tva_intra: body.opt_tva_intra,
      opt_conditions: body.opt_conditions,
      opt_signature: body.opt_signature,
      opt_intitule: body.opt_intitule,
      opt_champ_libre: body.opt_champ_libre,
      opt_remise: body.opt_remise,
      intitule_document: body.intitule_document,
      remise: body.remise,
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
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Requête invalide." }, { status: 400 });
  }
  const id = String(body.id ?? "");
  if (!id) return NextResponse.json({ error: "Devis inconnu." }, { status: 400 });
  if (body.statut !== undefined && !(STATUTS_DEVIS as readonly string[]).includes(String(body.statut))) {
    return NextResponse.json({ error: "Statut inconnu." }, { status: 400 });
  }
  try {
    await supabasePatchDevis({
      id,
      client_id: body.client_id ? String(body.client_id) : undefined,
      objet: body.objet !== undefined ? String(body.objet) : undefined,
      statut: body.statut !== undefined ? parseStatutDevis(body.statut) : undefined,
      validite_jours: body.validite_jours !== undefined ? Number(body.validite_jours) : undefined,
      notes: body.notes !== undefined ? (body.notes as string | null) : undefined,
      lignes: body.lignes !== undefined ? parseLignesDevis(body.lignes) : undefined,
      chantier_id:
        body.chantier_id !== undefined ? (body.chantier_id ? String(body.chantier_id) : null) : undefined,
      type_facturation:
        body.type_facturation !== undefined
          ? parseTypeFacturation(body.type_facturation)
          : undefined,
      langue: body.langue !== undefined ? String(body.langue) : undefined,
      opt_adresse_livraison:
        body.opt_adresse_livraison !== undefined ? Boolean(body.opt_adresse_livraison) : undefined,
      opt_siren: body.opt_siren !== undefined ? Boolean(body.opt_siren) : undefined,
      opt_tva_intra: body.opt_tva_intra !== undefined ? Boolean(body.opt_tva_intra) : undefined,
      opt_conditions: body.opt_conditions !== undefined ? Boolean(body.opt_conditions) : undefined,
      opt_signature: body.opt_signature !== undefined ? Boolean(body.opt_signature) : undefined,
      opt_intitule: body.opt_intitule !== undefined ? Boolean(body.opt_intitule) : undefined,
      opt_champ_libre: body.opt_champ_libre !== undefined ? Boolean(body.opt_champ_libre) : undefined,
      opt_remise: body.opt_remise !== undefined ? Boolean(body.opt_remise) : undefined,
      intitule_document:
        body.intitule_document !== undefined
          ? (body.intitule_document as string | null)
          : undefined,
      remise:
        body.remise !== undefined
          ? (body.remise as { type: "pourcentage" | "montant"; valeur: number } | null)
          : undefined,
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
  if (!body.id) return NextResponse.json({ error: "Devis inconnu." }, { status: 400 });
  try {
    await supabaseDeleteDevis(body.id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return fail(err, "Suppression impossible.");
  }
}
