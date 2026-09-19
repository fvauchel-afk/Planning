import type { LigneDevis, RemiseDevis } from "@/lib/devis/lignes";

export const STATUTS_DEVIS = ["brouillon", "envoye", "accepte", "refuse"] as const;
export type StatutDevis = (typeof STATUTS_DEVIS)[number];

export const STATUT_DEVIS_LABELS: Record<StatutDevis, string> = {
  brouillon: "Brouillon",
  envoye: "Envoyé",
  accepte: "Accepté",
  refuse: "Refusé",
};

export const TYPES_FACTURATION = ["rapide", "complet", "electronique"] as const;
export type TypeFacturation = (typeof TYPES_FACTURATION)[number];

export const TYPE_FACTURATION_LABELS: Record<TypeFacturation, string> = {
  rapide: "Rapide",
  complet: "Complet",
  electronique: "Format électronique",
};

export type ClientFiche = {
  id: string;
  nom: string;
  email: string | null;
  telephone: string | null;
  adresse: string | null;
  code_postal: string | null;
  ville: string | null;
  siren_siret: string | null;
  tva_intra: string | null;
  adresse_livraison: string | null;
  notes: string | null;
  lien_dossier_onedrive: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

export type EntrepriseReglages = {
  nom: string;
  forme_juridique: string;
  adresse: string;
  code_postal: string;
  ville: string;
  telephone: string;
  email: string;
  capital_social: string;
  siret: string;
  code_naf: string;
  rcs: string;
  tva_intra: string;
  iban: string;
  bic: string;
  logo_base64: string;
  logo_mime: string;
};

export const EMPTY_ENTREPRISE: EntrepriseReglages = {
  nom: "La Métallerie du Sud",
  forme_juridique: "SASU",
  adresse: "",
  code_postal: "",
  ville: "",
  telephone: "",
  email: "",
  capital_social: "",
  siret: "",
  code_naf: "",
  rcs: "",
  tva_intra: "",
  iban: "",
  bic: "",
  logo_base64: "",
  logo_mime: "",
};

export const MAX_LOGO_BASE64 = 700_000;

export type DevisReglages = {
  validite_jours_defaut: number;
  mail_sujet: string;
  mail_corps: string;
  conditions_acceptation_actif: boolean;
  conditions_acceptation_texte: string;
  champ_libre_actif: boolean;
  champ_libre_texte: string;
};

export type Devis = {
  id: string;
  numero: number;
  client_id: string;
  objet: string;
  statut: StatutDevis;
  date_emission: string;
  validite_jours: number;
  notes: string | null;
  lignes: LigneDevis[];
  chantier_id: string | null;
  envoye_at: string | null;
  envoye_a: string | null;
  created_by: string | null;
  type_facturation: TypeFacturation;
  langue: string;
  opt_adresse_livraison: boolean;
  opt_siren: boolean;
  opt_tva_intra: boolean;
  opt_conditions: boolean;
  opt_signature: boolean;
  opt_intitule: boolean;
  opt_champ_libre: boolean;
  opt_remise: boolean;
  intitule_document: string | null;
  remise: RemiseDevis;
  onedrive_fichier: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

export type DevisListe = Devis & {
  client_nom: string;
  client_email: string | null;
};

export type ClientPatch = Partial<Omit<ClientFiche, "id" | "created_at" | "updated_at">> & {
  id: string;
};

export type DevisPatch = {
  id: string;
  client_id?: string;
  objet?: string;
  statut?: StatutDevis;
  validite_jours?: number;
  notes?: string | null;
  lignes?: LigneDevis[];
  chantier_id?: string | null;
  type_facturation?: TypeFacturation;
  langue?: string;
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
};

export function parseStatutDevis(raw: unknown): StatutDevis {
  const value = String(raw ?? "");
  return (STATUTS_DEVIS as readonly string[]).includes(value)
    ? (value as StatutDevis)
    : "brouillon";
}

export function parseTypeFacturation(raw: unknown): TypeFacturation {
  const value = String(raw ?? "");
  return (TYPES_FACTURATION as readonly string[]).includes(value)
    ? (value as TypeFacturation)
    : "complet";
}

export function adresseClientLignes(
  client: Pick<ClientFiche, "nom" | "adresse" | "code_postal" | "ville">,
): string[] {
  const lines = [client.nom.trim()].filter(Boolean);
  if (client.adresse?.trim()) lines.push(client.adresse.trim());
  const ville = [client.code_postal?.trim(), client.ville?.trim()]
    .filter(Boolean)
    .join(" ");
  if (ville) lines.push(ville);
  return lines;
}

export function adresseEntrepriseLignes(e: EntrepriseReglages): string[] {
  const titre = [e.forme_juridique, e.nom].filter(Boolean).join(" ").trim();
  const lines = titre ? [titre] : [];
  if (e.adresse.trim()) lines.push(e.adresse.trim());
  const ville = [e.code_postal.trim(), e.ville.trim()].filter(Boolean).join(" ");
  if (ville) lines.push(ville);
  if (e.email.trim()) lines.push(e.email.trim());
  if (e.telephone.trim()) lines.push(e.telephone.trim());
  return lines;
}

export function mentionsLegalesPied(e: EntrepriseReglages): string {
  const bits = [
    e.forme_juridique && e.capital_social
      ? `${e.forme_juridique} au capital de ${e.capital_social}`
      : e.forme_juridique || e.nom,
    e.siret ? `SIRET ${e.siret}` : "",
    e.code_naf ? `NAF ${e.code_naf}` : "",
    e.rcs ? `RCS ${e.rcs}` : "",
    e.tva_intra ? `TVA ${e.tva_intra}` : "",
  ].filter(Boolean);
  return bits.join(" · ") || e.nom || "—";
}
