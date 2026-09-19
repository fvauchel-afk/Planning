import "server-only";
import { parisCalendarYmd } from "@/lib/dates";
import {
  normalizeLignesDevis,
  nextNumeroDevis,
  parseLignesDevis,
} from "@/lib/devis/lignes";
import {
  parseStatutDevis,
  type ClientFiche,
  type ClientPatch,
  type Devis,
  type DevisListe,
  type DevisPatch,
  type StatutDevis,
} from "@/lib/devis/types";
import { wrapSupabaseError } from "@/lib/supabase/errors";
import { createSupabaseServerClient } from "@/lib/supabase/server";

function mapClient(row: Record<string, unknown>): ClientFiche {
  return {
    id: String(row.id),
    nom: String(row.nom ?? ""),
    email: row.email ? String(row.email) : null,
    telephone: row.telephone ? String(row.telephone) : null,
    adresse: row.adresse ? String(row.adresse) : null,
    code_postal: row.code_postal ? String(row.code_postal) : null,
    ville: row.ville ? String(row.ville) : null,
    notes: row.notes ? String(row.notes) : null,
    created_at: row.created_at ? String(row.created_at) : null,
    updated_at: row.updated_at ? String(row.updated_at) : null,
  };
}

function mapDevis(row: Record<string, unknown>): Devis {
  return {
    id: String(row.id),
    numero: String(row.numero ?? ""),
    client_id: String(row.client_id),
    objet: String(row.objet ?? ""),
    statut: parseStatutDevis(row.statut),
    date_devis: String(row.date_devis ?? "").slice(0, 10),
    validite_jours: Number(row.validite_jours) || 30,
    tva_pct: Number(row.tva_pct) || 0,
    notes: row.notes ? String(row.notes) : null,
    lignes: parseLignesDevis(row.lignes),
    chantier_id: row.chantier_id ? String(row.chantier_id) : null,
    envoye_at: row.envoye_at ? String(row.envoye_at) : null,
    envoye_a: row.envoye_a ? String(row.envoye_a) : null,
    created_by: row.created_by ? String(row.created_by) : null,
    created_at: row.created_at ? String(row.created_at) : null,
    updated_at: row.updated_at ? String(row.updated_at) : null,
  };
}

export async function supabaseListClients(): Promise<ClientFiche[]> {
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase.from("clients").select("*").order("nom");
  if (error) throw wrapSupabaseError(error);
  return ((data ?? []) as Record<string, unknown>[]).map(mapClient);
}

export async function supabaseGetClient(id: string): Promise<ClientFiche | null> {
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .from("clients")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw wrapSupabaseError(error);
  return data ? mapClient(data as Record<string, unknown>) : null;
}

export async function supabaseUpsertClient(
  input: Omit<ClientFiche, "id" | "created_at" | "updated_at"> & { id?: string },
): Promise<string> {
  const supabase = createSupabaseServerClient();
  const payload = {
    nom: input.nom.trim(),
    email: input.email?.trim() || null,
    telephone: input.telephone?.trim() || null,
    adresse: input.adresse?.trim() || null,
    code_postal: input.code_postal?.trim() || null,
    ville: input.ville?.trim() || null,
    notes: input.notes?.trim() || null,
    updated_at: new Date().toISOString(),
  };
  if (input.id) {
    const { error } = await supabase.from("clients").update(payload).eq("id", input.id);
    if (error) throw wrapSupabaseError(error);
    return input.id;
  }
  const { data, error } = await supabase
    .from("clients")
    .insert(payload)
    .select("id")
    .single();
  if (error || !data) throw wrapSupabaseError(error ?? new Error("Création impossible."));
  return data.id as string;
}

export async function supabasePatchClient(input: ClientPatch): Promise<void> {
  const supabase = createSupabaseServerClient();
  const payload: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (input.nom !== undefined) payload.nom = input.nom.trim();
  if (input.email !== undefined) payload.email = input.email?.trim() || null;
  if (input.telephone !== undefined) payload.telephone = input.telephone?.trim() || null;
  if (input.adresse !== undefined) payload.adresse = input.adresse?.trim() || null;
  if (input.code_postal !== undefined) {
    payload.code_postal = input.code_postal?.trim() || null;
  }
  if (input.ville !== undefined) payload.ville = input.ville?.trim() || null;
  if (input.notes !== undefined) payload.notes = input.notes?.trim() || null;
  if (Object.keys(payload).length <= 1) return;
  const { error } = await supabase.from("clients").update(payload).eq("id", input.id);
  if (error) throw wrapSupabaseError(error);
}

export async function supabaseDeleteClient(id: string): Promise<void> {
  const supabase = createSupabaseServerClient();
  const { count, error: countError } = await supabase
    .from("devis")
    .select("id", { count: "exact", head: true })
    .eq("client_id", id);
  if (countError) throw wrapSupabaseError(countError);
  if ((count ?? 0) > 0) {
    throw new Error("Impossible de supprimer : des devis sont rattachés à cette fiche.");
  }
  const { error } = await supabase.from("clients").delete().eq("id", id);
  if (error) throw wrapSupabaseError(error);
}

export async function supabaseListDevis(clientId?: string): Promise<DevisListe[]> {
  const supabase = createSupabaseServerClient();
  let query = supabase
    .from("devis")
    .select("*, clients(nom, email)")
    .order("date_devis", { ascending: false })
    .order("numero", { ascending: false });
  if (clientId) query = query.eq("client_id", clientId);
  const { data, error } = await query;
  if (error) throw wrapSupabaseError(error);
  return ((data ?? []) as Record<string, unknown>[]).map((row) => {
    const devis = mapDevis(row);
    const client = row.clients as { nom?: string; email?: string } | null;
    return {
      ...devis,
      client_nom: String(client?.nom ?? ""),
      client_email: client?.email ? String(client.email) : null,
    };
  });
}

export async function supabaseGetDevis(id: string): Promise<Devis | null> {
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase.from("devis").select("*").eq("id", id).maybeSingle();
  if (error) throw wrapSupabaseError(error);
  return data ? mapDevis(data as Record<string, unknown>) : null;
}

async function allocNumero(): Promise<string> {
  const supabase = createSupabaseServerClient();
  const year = Number(parisCalendarYmd().slice(0, 4));
  const prefix = `DEV-${year}-`;
  const { data, error } = await supabase
    .from("devis")
    .select("numero")
    .like("numero", `${prefix}%`);
  if (error) throw wrapSupabaseError(error);
  const existing = ((data ?? []) as { numero: string }[]).map((row) => row.numero);
  return nextNumeroDevis(existing, year);
}

export async function supabaseCreateDevis(input: {
  client_id: string;
  objet?: string;
  date_devis?: string;
  validite_jours?: number;
  tva_pct?: number;
  notes?: string | null;
  lignes?: unknown;
  chantier_id?: string | null;
  created_by?: string | null;
}): Promise<string> {
  const supabase = createSupabaseServerClient();
  const payload = {
    numero: await allocNumero(),
    client_id: input.client_id,
    objet: input.objet?.trim() ?? "",
    statut: "brouillon" as StatutDevis,
    date_devis: input.date_devis || parisCalendarYmd(),
    validite_jours: input.validite_jours ?? 30,
    tva_pct: input.tva_pct ?? 20,
    notes: input.notes?.trim() || null,
    lignes: normalizeLignesDevis(parseLignesDevis(input.lignes)),
    chantier_id: input.chantier_id || null,
    created_by: input.created_by?.trim() || null,
    updated_at: new Date().toISOString(),
  };
  const { data, error } = await supabase
    .from("devis")
    .insert(payload)
    .select("id")
    .single();
  if (error || !data) throw wrapSupabaseError(error ?? new Error("Création impossible."));
  return data.id as string;
}

export async function supabasePatchDevis(input: DevisPatch): Promise<void> {
  const supabase = createSupabaseServerClient();
  const payload: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (input.client_id !== undefined) payload.client_id = input.client_id;
  if (input.objet !== undefined) payload.objet = input.objet.trim();
  if (input.statut !== undefined) payload.statut = input.statut;
  if (input.date_devis !== undefined) payload.date_devis = input.date_devis;
  if (input.validite_jours !== undefined) payload.validite_jours = input.validite_jours;
  if (input.tva_pct !== undefined) payload.tva_pct = input.tva_pct;
  if (input.notes !== undefined) payload.notes = input.notes?.trim() || null;
  if (input.lignes !== undefined) payload.lignes = normalizeLignesDevis(input.lignes);
  if (input.chantier_id !== undefined) payload.chantier_id = input.chantier_id || null;
  if (Object.keys(payload).length <= 1) return;
  const { error } = await supabase.from("devis").update(payload).eq("id", input.id);
  if (error) throw wrapSupabaseError(error);
}

export async function supabaseDeleteDevis(id: string): Promise<void> {
  const supabase = createSupabaseServerClient();
  const current = await supabaseGetDevis(id);
  if (!current) throw new Error("Devis introuvable.");
  if (current.statut !== "brouillon") {
    throw new Error("Seul un brouillon peut être supprimé.");
  }
  const { error } = await supabase.from("devis").delete().eq("id", id);
  if (error) throw wrapSupabaseError(error);
}

export async function supabaseMarkDevisEnvoye(input: {
  id: string;
  to: string;
}): Promise<void> {
  const supabase = createSupabaseServerClient();
  const { error } = await supabase
    .from("devis")
    .update({
      statut: "envoye",
      envoye_at: new Date().toISOString(),
      envoye_a: input.to.trim(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", input.id);
  if (error) throw wrapSupabaseError(error);
}
