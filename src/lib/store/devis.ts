import "server-only";
import { parisCalendarYmd } from "@/lib/dates";
import {
  CONDITIONS_ACCEPTATION_DEFAUT,
  MAIL_CORPS_DEFAUT,
  MAIL_SUJET_DEFAUT,
} from "@/lib/devis/defaults";
import { normalizeLignesDevis, parseLignesDevis, type RemiseDevis } from "@/lib/devis/lignes";
import {
  parseStatutDevis,
  parseTypeClient,
  parseTypeFacturation,
  type ClientFiche,
  type ClientPatch,
  type Devis,
  type DevisListe,
  type DevisPatch,
  type DevisReglages,
  EMPTY_ENTREPRISE,
  type EntrepriseReglages,
  type StatutDevis,
} from "@/lib/devis/types";
import { isMissingColumnError, wrapSupabaseError } from "@/lib/supabase/errors";
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
    pays: row.pays ? String(row.pays) : null,
    type_client: parseTypeClient(row.type_client),
    siren_siret: row.siren_siret ? String(row.siren_siret) : null,
    tva_intra: row.tva_intra ? String(row.tva_intra) : null,
    adresse_livraison: row.adresse_livraison ? String(row.adresse_livraison) : null,
    notes: row.notes ? String(row.notes) : null,
    lien_dossier_onedrive: row.lien_dossier_onedrive
      ? String(row.lien_dossier_onedrive)
      : null,
    created_at: row.created_at ? String(row.created_at) : null,
    updated_at: row.updated_at ? String(row.updated_at) : null,
  };
}

function mapRemise(row: Record<string, unknown>): RemiseDevis {
  const type = String(row.remise_type ?? "");
  const valeur = Number(row.remise_valeur);
  if ((type === "pourcentage" || type === "montant") && Number.isFinite(valeur)) {
    return { type, valeur };
  }
  return null;
}

function mapDevis(row: Record<string, unknown>): Devis {
  const numeroRaw = row.numero;
  const numero =
    typeof numeroRaw === "number"
      ? numeroRaw
      : Number(String(numeroRaw ?? "").replace(/\D/g, "")) || 0;
  return {
    id: String(row.id),
    numero,
    client_id: String(row.client_id),
    objet: String(row.objet ?? ""),
    statut: parseStatutDevis(row.statut),
    date_emission: String(row.date_emission ?? row.date_devis ?? "").slice(0, 10),
    validite_jours: Number(row.validite_jours) || 5,
    notes: row.notes ? String(row.notes) : null,
    lignes: parseLignesDevis(row.lignes),
    chantier_id: row.chantier_id ? String(row.chantier_id) : null,
    envoye_at: row.envoye_at ? String(row.envoye_at) : null,
    envoye_a: row.envoye_a ? String(row.envoye_a) : null,
    created_by: row.created_by ? String(row.created_by) : null,
    type_facturation: parseTypeFacturation(row.type_facturation),
    langue: String(row.langue ?? "fr") || "fr",
    opt_adresse_livraison: Boolean(row.opt_adresse_livraison),
    opt_siren: Boolean(row.opt_siren),
    opt_tva_intra: Boolean(row.opt_tva_intra),
    opt_conditions: row.opt_conditions !== false,
    opt_signature: row.opt_signature !== false,
    opt_intitule: Boolean(row.opt_intitule),
    opt_champ_libre: Boolean(row.opt_champ_libre),
    opt_remise: Boolean(row.opt_remise),
    intitule_document: row.intitule_document ? String(row.intitule_document) : null,
    remise: mapRemise(row),
    onedrive_fichier: row.onedrive_fichier ? String(row.onedrive_fichier) : null,
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
  const { data, error } = await supabase.from("clients").select("*").eq("id", id).maybeSingle();
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
    pays: input.pays?.trim() || null,
    type_client: parseTypeClient(input.type_client),
    siren_siret:
      parseTypeClient(input.type_client) === "professionnel"
        ? input.siren_siret?.trim() || null
        : null,
    tva_intra: input.tva_intra?.trim() || null,
    adresse_livraison: input.adresse_livraison?.trim() || null,
    notes: input.notes?.trim() || null,
    lien_dossier_onedrive: input.lien_dossier_onedrive?.trim() || null,
    updated_at: new Date().toISOString(),
  };
  if (input.id) {
    const { error } = await supabase.from("clients").update(payload).eq("id", input.id);
    if (error) throw wrapSupabaseError(error);
    return input.id;
  }
  const { data, error } = await supabase.from("clients").insert(payload).select("id").single();
  if (error || !data) throw wrapSupabaseError(error ?? new Error("Création impossible."));
  return data.id as string;
}

export async function supabasePatchClient(input: ClientPatch): Promise<void> {
  const supabase = createSupabaseServerClient();
  const payload: Record<string, unknown> = { updated_at: new Date().toISOString() };
  const str = (key: keyof ClientPatch, value: unknown) => {
    if (value !== undefined) payload[key] = String(value ?? "").trim() || null;
  };
  if (input.nom !== undefined) payload.nom = input.nom.trim();
  str("email", input.email);
  str("telephone", input.telephone);
  str("adresse", input.adresse);
  str("code_postal", input.code_postal);
  str("ville", input.ville);
  str("pays", input.pays);
  if (input.type_client !== undefined) payload.type_client = parseTypeClient(input.type_client);
  str("siren_siret", input.siren_siret);
  str("tva_intra", input.tva_intra);
  str("adresse_livraison", input.adresse_livraison);
  str("notes", input.notes);
  str("lien_dossier_onedrive", input.lien_dossier_onedrive);
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

function remisePayload(remise: RemiseDevis): { remise_type: string | null; remise_valeur: number | null } {
  if (!remise) return { remise_type: null, remise_valeur: null };
  return { remise_type: remise.type, remise_valeur: remise.valeur };
}

export async function supabaseCreateDevis(input: {
  client_id: string;
  objet?: string;
  validite_jours?: number;
  notes?: string | null;
  lignes?: unknown;
  created_by?: string | null;
  type_facturation?: Devis["type_facturation"];
  opt_adresse_livraison?: boolean;
  opt_siren?: boolean;
  opt_tva_intra?: boolean;
  opt_conditions?: boolean;
  opt_signature?: boolean;
  opt_intitule?: boolean;
  opt_champ_libre?: boolean;
  opt_remise?: boolean;
  intitule_document?: string | null;
  remise?: RemiseDevis;
}): Promise<string> {
  const supabase = createSupabaseServerClient();
  const reglages = await supabaseGetDevisReglages();
  const payload = {
    client_id: input.client_id,
    objet: input.objet?.trim() ?? "",
    statut: "brouillon" as StatutDevis,
    date_emission: parisCalendarYmd(),
    date_devis: parisCalendarYmd(),
    validite_jours: input.validite_jours ?? reglages.validite_jours_defaut,
    notes: input.notes?.trim() || null,
    lignes: normalizeLignesDevis(parseLignesDevis(input.lignes)),
    created_by: input.created_by?.trim() || null,
    type_facturation: input.type_facturation ?? "complet",
    opt_adresse_livraison: Boolean(input.opt_adresse_livraison),
    opt_siren: Boolean(input.opt_siren),
    opt_tva_intra: Boolean(input.opt_tva_intra),
    opt_conditions: input.opt_conditions ?? reglages.conditions_acceptation_actif,
    opt_signature: input.opt_signature !== false,
    opt_intitule: Boolean(input.opt_intitule),
    opt_champ_libre: input.opt_champ_libre ?? reglages.champ_libre_actif,
    opt_remise: Boolean(input.opt_remise),
    intitule_document: input.intitule_document?.trim() || null,
    ...remisePayload(input.remise ?? null),
    updated_at: new Date().toISOString(),
  };
  const { data, error } = await supabase.from("devis").insert(payload).select("id").single();
  if (error || !data) throw wrapSupabaseError(error ?? new Error("Création impossible."));
  return data.id as string;
}

export async function supabasePatchDevis(input: DevisPatch): Promise<void> {
  const supabase = createSupabaseServerClient();
  const payload: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (input.client_id !== undefined) payload.client_id = input.client_id;
  if (input.objet !== undefined) payload.objet = input.objet.trim();
  if (input.statut !== undefined) payload.statut = input.statut;
  if (input.validite_jours !== undefined) payload.validite_jours = input.validite_jours;
  if (input.notes !== undefined) payload.notes = input.notes?.trim() || null;
  if (input.lignes !== undefined) payload.lignes = normalizeLignesDevis(input.lignes);
  if (input.chantier_id !== undefined) payload.chantier_id = input.chantier_id || null;
  if (input.type_facturation !== undefined) payload.type_facturation = input.type_facturation;
  if (input.langue !== undefined) payload.langue = input.langue;
  if (input.opt_adresse_livraison !== undefined) {
    payload.opt_adresse_livraison = input.opt_adresse_livraison;
  }
  if (input.opt_siren !== undefined) payload.opt_siren = input.opt_siren;
  if (input.opt_tva_intra !== undefined) payload.opt_tva_intra = input.opt_tva_intra;
  if (input.opt_conditions !== undefined) payload.opt_conditions = input.opt_conditions;
  if (input.opt_signature !== undefined) payload.opt_signature = input.opt_signature;
  if (input.opt_intitule !== undefined) payload.opt_intitule = input.opt_intitule;
  if (input.opt_champ_libre !== undefined) payload.opt_champ_libre = input.opt_champ_libre;
  if (input.opt_remise !== undefined) payload.opt_remise = input.opt_remise;
  if (input.intitule_document !== undefined) {
    payload.intitule_document = input.intitule_document?.trim() || null;
  }
  if (input.remise !== undefined) Object.assign(payload, remisePayload(input.remise));
  if (Object.keys(payload).length <= 1) return;
  const { error } = await supabase.from("devis").update(payload).eq("id", input.id);
  if (error) throw wrapSupabaseError(error);
}

export async function supabaseDeleteDevis(id: string): Promise<void> {
  const supabase = createSupabaseServerClient();
  const current = await supabaseGetDevis(id);
  if (!current) throw new Error("Devis introuvable.");
  if (current.statut !== "brouillon") {
    throw new Error("Seul un brouillon peut être supprimé. Le numéro n’est jamais réutilisé.");
  }
  const { error } = await supabase.from("devis").delete().eq("id", id);
  if (error) throw wrapSupabaseError(error);
}

export async function supabaseSetDevisOnedriveFichier(
  id: string,
  fileName: string | null,
): Promise<void> {
  const supabase = createSupabaseServerClient();
  const { error } = await supabase
    .from("devis")
    .update({
      onedrive_fichier: fileName,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (error) throw wrapSupabaseError(error);
}

export async function supabaseMarkDevisEnvoye(input: {
  id: string;
  to: string;
  onedrive?: string | null;
}): Promise<void> {
  const supabase = createSupabaseServerClient();
  const payload: Record<string, unknown> = {
    statut: "envoye",
    envoye_at: new Date().toISOString(),
    envoye_a: input.to.trim(),
    updated_at: new Date().toISOString(),
  };
  if (input.onedrive !== undefined) payload.onedrive_fichier = input.onedrive;
  const { error } = await supabase.from("devis").update(payload).eq("id", input.id);
  if (error) throw wrapSupabaseError(error);
}

export async function supabaseGetEntreprise(): Promise<EntrepriseReglages> {
  const supabase = createSupabaseServerClient();
  const empty: EntrepriseReglages = { ...EMPTY_ENTREPRISE };
  const { data, error } = await supabase
    .from("entreprise_reglages")
    .select("*")
    .eq("id", "default")
    .maybeSingle();
  if (error) throw wrapSupabaseError(error);
  if (!data) return empty;
  const row = data as Record<string, unknown>;
  const s = (k: string) => String(row[k] ?? "");
  return {
    nom: s("nom") || empty.nom,
    forme_juridique: s("forme_juridique") || empty.forme_juridique,
    adresse: s("adresse"),
    code_postal: s("code_postal"),
    ville: s("ville"),
    telephone: s("telephone"),
    email: s("email"),
    capital_social: s("capital_social"),
    siret: s("siret"),
    code_naf: s("code_naf"),
    rcs: s("rcs"),
    tva_intra: s("tva_intra"),
    iban: s("iban"),
    bic: s("bic"),
    logo_base64: s("logo_base64"),
    logo_mime: s("logo_mime"),
  };
}

export async function supabaseSaveEntreprise(input: EntrepriseReglages): Promise<void> {
  const supabase = createSupabaseServerClient();
  const payload: Record<string, unknown> = {
    id: "default",
    nom: input.nom,
    forme_juridique: input.forme_juridique,
    adresse: input.adresse,
    code_postal: input.code_postal,
    ville: input.ville,
    telephone: input.telephone,
    email: input.email,
    capital_social: input.capital_social,
    siret: input.siret,
    code_naf: input.code_naf,
    rcs: input.rcs,
    tva_intra: input.tva_intra,
    iban: input.iban,
    bic: input.bic,
    logo_base64: input.logo_base64 || null,
    logo_mime: input.logo_mime || null,
    updated_at: new Date().toISOString(),
  };
  const first = await supabase.from("entreprise_reglages").upsert(payload);
  if (!first.error) return;
  if (isMissingColumnError(first.error, "logo_base64") || isMissingColumnError(first.error, "logo_mime")) {
    delete payload.logo_base64;
    delete payload.logo_mime;
    const retry = await supabase.from("entreprise_reglages").upsert(payload);
    if (retry.error) throw wrapSupabaseError(retry.error);
    return;
  }
  throw wrapSupabaseError(first.error);
}

export async function supabaseGetDevisReglages(): Promise<DevisReglages> {
  const supabase = createSupabaseServerClient();
  const fallback: DevisReglages = {
    validite_jours_defaut: 5,
    mail_sujet: MAIL_SUJET_DEFAUT,
    mail_corps: MAIL_CORPS_DEFAUT,
    conditions_acceptation_actif: true,
    conditions_acceptation_texte: CONDITIONS_ACCEPTATION_DEFAUT,
    champ_libre_actif: false,
    champ_libre_texte: "",
  };
  const { data, error } = await supabase
    .from("devis_reglages")
    .select("*")
    .eq("id", "default")
    .maybeSingle();
  if (error) throw wrapSupabaseError(error);
  if (!data) return fallback;
  const row = data as Record<string, unknown>;
  return {
    validite_jours_defaut: Number(row.validite_jours_defaut) || 5,
    mail_sujet: String(row.mail_sujet ?? "") || MAIL_SUJET_DEFAUT,
    mail_corps: String(row.mail_corps ?? "") || MAIL_CORPS_DEFAUT,
    conditions_acceptation_actif: row.conditions_acceptation_actif !== false,
    conditions_acceptation_texte:
      String(row.conditions_acceptation_texte ?? "") || CONDITIONS_ACCEPTATION_DEFAUT,
    champ_libre_actif: Boolean(row.champ_libre_actif),
    champ_libre_texte: String(row.champ_libre_texte ?? ""),
  };
}

export async function supabaseSaveDevisReglages(input: DevisReglages): Promise<void> {
  const supabase = createSupabaseServerClient();
  const { error } = await supabase.from("devis_reglages").upsert({
    id: "default",
    validite_jours_defaut: input.validite_jours_defaut,
    mail_sujet: input.mail_sujet,
    mail_corps: input.mail_corps,
    conditions_acceptation_actif: input.conditions_acceptation_actif,
    conditions_acceptation_texte: input.conditions_acceptation_texte,
    champ_libre_actif: input.champ_libre_actif,
    champ_libre_texte: input.champ_libre_texte,
    updated_at: new Date().toISOString(),
  });
  if (error) throw wrapSupabaseError(error);
}
