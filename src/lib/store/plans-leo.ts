import "server-only";
import { matchByClientNom } from "@/lib/plan-leo/match";
import { parseOuvragePlan } from "@/lib/plan-leo/ouvrage";
import type { PlanLeo, PlanLeoListe } from "@/lib/plan-leo/types";
import { wrapSupabaseError } from "@/lib/supabase/errors";
import { createSupabaseServerClient } from "@/lib/supabase/server";

function mapListe(row: Record<string, unknown>): PlanLeoListe {
  return {
    id: String(row.id),
    client_nom: String(row.client_nom ?? ""),
    reference: String(row.reference ?? ""),
    indice: String(row.indice ?? "A"),
    chantier_id: row.chantier_id ? String(row.chantier_id) : null,
    onedrive_svg: row.onedrive_svg ? String(row.onedrive_svg) : null,
    onedrive_json: row.onedrive_json ? String(row.onedrive_json) : null,
    updated_at: row.updated_at ? String(row.updated_at) : null,
  };
}

function mapPlan(row: Record<string, unknown>): PlanLeo {
  const params =
    row.params && typeof row.params === "object" && !Array.isArray(row.params)
      ? (row.params as Record<string, string | number>)
      : {};
  return { ...mapListe(row), params };
}

export async function supabaseListPlansLeo(): Promise<PlanLeoListe[]> {
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .from("plans_leo")
    .select(
      "id, client_nom, reference, indice, chantier_id, onedrive_svg, onedrive_json, updated_at",
    )
    .order("updated_at", { ascending: false })
    .limit(400);
  if (error) throw wrapSupabaseError(error);
  return ((data ?? []) as Record<string, unknown>[]).map(mapListe);
}

export async function supabaseGetPlanLeo(id: string): Promise<PlanLeo | null> {
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase.from("plans_leo").select("*").eq("id", id).maybeSingle();
  if (error) throw wrapSupabaseError(error);
  return data ? mapPlan(data as Record<string, unknown>) : null;
}

export async function supabaseFindPlansLeo(input: {
  clientNom?: string;
  chantierId?: string;
}): Promise<PlanLeo[]> {
  const supabase = createSupabaseServerClient();
  if (input.chantierId) {
    const { data, error } = await supabase
      .from("plans_leo")
      .select("*")
      .eq("chantier_id", input.chantierId)
      .order("updated_at", { ascending: false });
    if (error) throw wrapSupabaseError(error);
    const rows = ((data ?? []) as Record<string, unknown>[]).map(mapPlan);
    if (rows.length > 0) return rows;
    const { data: chantier, error: chantierError } = await supabase
      .from("chantiers")
      .select("nom_client")
      .eq("id", input.chantierId)
      .maybeSingle();
    if (chantierError) throw wrapSupabaseError(chantierError);
    if (chantier?.nom_client) {
      return supabaseFindPlansLeo({ clientNom: String(chantier.nom_client) });
    }
  }
  const all = await supabaseListPlansLeo();
  if (!input.clientNom?.trim()) return [];
  const ids = matchByClientNom(
    all.map((row) => ({ ...row, nom_client: row.client_nom })),
    input.clientNom,
  ).map((row) => row.id);
  if (ids.length === 0) return [];
  const { data, error } = await supabase.from("plans_leo").select("*").in("id", ids);
  if (error) throw wrapSupabaseError(error);
  return ((data ?? []) as Record<string, unknown>[]).map(mapPlan);
}

async function findChantierIdByNom(nom: string): Promise<string | null> {
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .from("chantiers")
    .select("id, nom_client, date_creation")
    .order("date_creation", { ascending: false })
    .limit(400);
  if (error) throw wrapSupabaseError(error);
  const hit = matchByClientNom(
    ((data ?? []) as { id: string; nom_client: string }[]),
    nom,
  )[0];
  return hit?.id ?? null;
}

export async function supabaseUpsertPlanLeo(input: {
  clientNom: string;
  reference: string;
  indice: string;
  params: Record<string, string | number>;
  chantierId?: string | null;
  onedriveSvg?: string | null;
  onedriveJson?: string | null;
}): Promise<string> {
  const supabase = createSupabaseServerClient();
  const clientNom = input.clientNom.trim();
  const wanted = parseOuvragePlan(input.params.ouvrage);
  const existing = (await supabaseFindPlansLeo({ clientNom })).find(
    (row) => parseOuvragePlan(row.params.ouvrage) === wanted,
  );
  const chantierId =
    input.chantierId?.trim() || existing?.chantier_id || (await findChantierIdByNom(clientNom));
  const payload = {
    client_nom: clientNom,
    reference: input.reference.trim(),
    indice: input.indice.trim() || "A",
    params: input.params,
    chantier_id: chantierId || null,
    onedrive_svg: input.onedriveSvg ?? existing?.onedrive_svg ?? null,
    onedrive_json: input.onedriveJson ?? existing?.onedrive_json ?? null,
    updated_at: new Date().toISOString(),
  };
  if (existing) {
    const { error } = await supabase.from("plans_leo").update(payload).eq("id", existing.id);
    if (error) throw wrapSupabaseError(error);
    return existing.id;
  }
  const { data, error } = await supabase.from("plans_leo").insert(payload).select("id").single();
  if (error || !data) throw wrapSupabaseError(error ?? new Error("Enregistrement impossible."));
  return data.id as string;
}
