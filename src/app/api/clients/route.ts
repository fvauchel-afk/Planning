import { NextRequest, NextResponse } from "next/server";
import {
  forbidden,
  getSession,
  resolveSession,
  unauthorized,
} from "@/lib/auth/guard";
import { isMissingSchemaError } from "@/lib/supabase/errors";
import {
  supabaseDeleteClient,
  supabaseGetClient,
  supabaseListClients,
  supabasePatchClient,
  supabaseUpsertClient,
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
  try {
    if (id) {
      const client = await supabaseGetClient(id);
      if (!client) return NextResponse.json({ error: "Client introuvable." }, { status: 404 });
      return NextResponse.json({ client });
    }
    const rows = await supabaseListClients();
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
    nom?: string;
    email?: string;
    telephone?: string;
    adresse?: string;
    code_postal?: string;
    ville?: string;
    notes?: string;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Requête invalide." }, { status: 400 });
  }
  const nom = body.nom?.trim() ?? "";
  if (!nom) {
    return NextResponse.json({ error: "Le nom du client est obligatoire." }, { status: 400 });
  }
  const email = body.email?.trim() ?? "";
  if (email && !email.includes("@")) {
    return NextResponse.json({ error: "E-mail invalide." }, { status: 400 });
  }
  try {
    const id = await supabaseUpsertClient({
      nom,
      email: email || null,
      telephone: body.telephone?.trim() || null,
      adresse: body.adresse?.trim() || null,
      code_postal: body.code_postal?.trim() || null,
      ville: body.ville?.trim() || null,
      notes: body.notes?.trim() || null,
    });
    return NextResponse.json({ ok: true, id });
  } catch (err) {
    return fail(err, "Enregistrement impossible.");
  }
}

export async function PATCH(request: NextRequest) {
  const session = await resolveSession(await getSession());
  if (!session) return unauthorized();
  if (!session.isAdmin) return forbidden();
  let body: {
    id?: string;
    nom?: string;
    email?: string | null;
    telephone?: string | null;
    adresse?: string | null;
    code_postal?: string | null;
    ville?: string | null;
    notes?: string | null;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Requête invalide." }, { status: 400 });
  }
  if (!body.id) {
    return NextResponse.json({ error: "Client inconnu." }, { status: 400 });
  }
  if (body.nom !== undefined && !body.nom.trim()) {
    return NextResponse.json({ error: "Le nom du client est obligatoire." }, { status: 400 });
  }
  if (body.email !== undefined && body.email && !String(body.email).includes("@")) {
    return NextResponse.json({ error: "E-mail invalide." }, { status: 400 });
  }
  try {
    await supabasePatchClient({
      id: body.id,
      nom: body.nom,
      email: body.email,
      telephone: body.telephone,
      adresse: body.adresse,
      code_postal: body.code_postal,
      ville: body.ville,
      notes: body.notes,
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
    return NextResponse.json({ error: "Client inconnu." }, { status: 400 });
  }
  try {
    await supabaseDeleteClient(body.id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return fail(err, "Suppression impossible.");
  }
}
