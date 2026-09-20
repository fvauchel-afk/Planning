import { NextRequest, NextResponse } from "next/server";
import {
  forbidden,
  getSession,
  resolveSession,
  unauthorized,
} from "@/lib/auth/guard";
import { planLeoFileStem } from "@/lib/plan-leo/match";
import { parseOuvragePlan, planOuvrageStem } from "@/lib/plan-leo/ouvrage";
import { uploadBytesToClientFolder } from "@/lib/onedrive/graph";
import { sanitizeOnedriveName } from "@/lib/onedrive/sanitize";
import { loadOnedriveTokens } from "@/lib/onedrive/tokens";
import { isMissingSchemaError } from "@/lib/supabase/errors";
import {
  supabaseFindPlansLeo,
  supabaseGetPlanLeo,
  supabaseListPlansLeo,
  supabaseUpsertPlanLeo,
} from "@/lib/store/plans-leo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const SQL_HELP = "Table plans_leo absente. Exécutez supabase/migrations/043_plans_leo.sql.";

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
  const chantierId = request.nextUrl.searchParams.get("chantierId")?.trim();
  const client = request.nextUrl.searchParams.get("client")?.trim();
  try {
    if (id) {
      const plan = await supabaseGetPlanLeo(id);
      if (!plan) return NextResponse.json({ error: "Plan introuvable." }, { status: 404 });
      return NextResponse.json({ plan });
    }
    if (chantierId || client) {
      return NextResponse.json({
        rows: await supabaseFindPlansLeo({ chantierId, clientNom: client }),
      });
    }
    return NextResponse.json({ rows: await supabaseListPlansLeo() });
  } catch (err) {
    return fail(err, "Lecture impossible.", 500);
  }
}

export async function POST(request: NextRequest) {
  const session = await resolveSession(await getSession());
  if (!session) return unauthorized();
  if (!session.isAdmin) return forbidden();
  let body: {
    params?: Record<string, string | number>;
    svg?: string;
    chantierId?: string | null;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Requête invalide." }, { status: 400 });
  }
  const params = body.params ?? {};
  const client = String(params.client ?? "").trim();
  if (!client) {
    return NextResponse.json(
      { error: "Indiquez le nom du client (même nom que le chantier / le dossier OneDrive)." },
      { status: 400 },
    );
  }
  const tokens = await loadOnedriveTokens();
  if (!tokens?.refresh_token) {
    return NextResponse.json(
      {
        error:
          "OneDrive n’est pas connecté. Ouvrez l’onglet OneDrive puis Connecter OneDrive.",
      },
      { status: 400 },
    );
  }
  const reference = String(params.reference ?? "");
  const indice = String(params.indice ?? "A");
  const ouvrage = parseOuvragePlan(params.ouvrage);
  const stem = sanitizeOnedriveName(
    planLeoFileStem({
      client,
      reference,
      gamme: ouvrage === "portail-leo" ? String(params.gamme ?? "LEO") : planOuvrageStem(ouvrage),
      indice,
    }),
    `Plan_${planOuvrageStem(ouvrage)}`,
  );
  const svgName = `${stem}.svg`;
  const jsonName = `${stem}.json`;
  const svg =
    typeof body.svg === "string" && body.svg.trim()
      ? body.svg.startsWith("<?xml")
        ? body.svg
        : `<?xml version="1.0" encoding="UTF-8"?>\n${body.svg}`
      : "";
  try {
    await uploadBytesToClientFolder({
      nomClient: client,
      fileName: jsonName,
      bytes: Buffer.from(JSON.stringify({ params }, null, 2), "utf8"),
      contentType: "application/json",
    });
    if (svg) {
      await uploadBytesToClientFolder({
        nomClient: client,
        fileName: svgName,
        bytes: Buffer.from(svg, "utf8"),
        contentType: "image/svg+xml",
      });
    }
    const id = await supabaseUpsertPlanLeo({
      clientNom: client,
      reference,
      indice,
      params,
      chantierId: body.chantierId,
      onedriveSvg: svg ? svgName : null,
      onedriveJson: jsonName,
    });
    return NextResponse.json({ ok: true, id, folder: client, svgName, jsonName });
  } catch (err) {
    return fail(err, "Enregistrement OneDrive impossible.");
  }
}
