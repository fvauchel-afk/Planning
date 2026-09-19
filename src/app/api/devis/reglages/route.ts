import { NextRequest, NextResponse } from "next/server";
import {
  forbidden,
  getSession,
  resolveSession,
  unauthorized,
} from "@/lib/auth/guard";
import type { DevisReglages, EntrepriseReglages } from "@/lib/devis/types";
import { isMissingSchemaError } from "@/lib/supabase/errors";
import {
  supabaseGetDevisReglages,
  supabaseGetEntreprise,
  supabaseSaveDevisReglages,
  supabaseSaveEntreprise,
} from "@/lib/store/devis";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function fail(err: unknown) {
  const message = err instanceof Error ? err.message : "Impossible.";
  return NextResponse.json(
    {
      error: isMissingSchemaError(err)
        ? "Exécutez supabase/migrations/042_devis_reglages_entreprise.sql."
        : message,
    },
    { status: 400 },
  );
}

export async function GET(request: NextRequest) {
  const session = await resolveSession(await getSession());
  if (!session) return unauthorized();
  if (!session.isAdmin) return forbidden();
  const kind = request.nextUrl.searchParams.get("kind") || "entreprise";
  try {
    if (kind === "devis") {
      return NextResponse.json({ reglages: await supabaseGetDevisReglages() });
    }
    return NextResponse.json({ entreprise: await supabaseGetEntreprise() });
  } catch (err) {
    return fail(err);
  }
}

export async function PUT(request: NextRequest) {
  const session = await resolveSession(await getSession());
  if (!session) return unauthorized();
  if (!session.isAdmin) return forbidden();
  let body: { kind?: string; entreprise?: EntrepriseReglages; reglages?: DevisReglages };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Requête invalide." }, { status: 400 });
  }
  try {
    if (body.kind === "devis" && body.reglages) {
      await supabaseSaveDevisReglages(body.reglages);
      return NextResponse.json({ ok: true });
    }
    if (body.entreprise) {
      await supabaseSaveEntreprise(body.entreprise);
      return NextResponse.json({ ok: true });
    }
    return NextResponse.json({ error: "Rien à enregistrer." }, { status: 400 });
  } catch (err) {
    return fail(err);
  }
}
