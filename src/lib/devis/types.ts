import type { LigneDevis } from "@/lib/devis/lignes";

export const STATUTS_DEVIS = ["brouillon", "envoye", "accepte", "refuse"] as const;
export type StatutDevis = (typeof STATUTS_DEVIS)[number];

export const STATUT_DEVIS_LABELS: Record<StatutDevis, string> = {
  brouillon: "Brouillon",
  envoye: "Envoyé",
  accepte: "Accepté",
  refuse: "Refusé",
};

export type ClientFiche = {
  id: string;
  nom: string;
  email: string | null;
  telephone: string | null;
  adresse: string | null;
  code_postal: string | null;
  ville: string | null;
  notes: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

export type Devis = {
  id: string;
  numero: string;
  client_id: string;
  objet: string;
  statut: StatutDevis;
  date_devis: string;
  validite_jours: number;
  tva_pct: number;
  notes: string | null;
  lignes: LigneDevis[];
  chantier_id: string | null;
  envoye_at: string | null;
  envoye_a: string | null;
  created_by: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

export type DevisListe = Devis & {
  client_nom: string;
  client_email: string | null;
};

export type ClientPatch = {
  id: string;
  nom?: string;
  email?: string | null;
  telephone?: string | null;
  adresse?: string | null;
  code_postal?: string | null;
  ville?: string | null;
  notes?: string | null;
};

export type DevisPatch = {
  id: string;
  client_id?: string;
  objet?: string;
  statut?: StatutDevis;
  date_devis?: string;
  validite_jours?: number;
  tva_pct?: number;
  notes?: string | null;
  lignes?: LigneDevis[];
  chantier_id?: string | null;
};

export function parseStatutDevis(raw: unknown): StatutDevis {
  const value = String(raw ?? "");
  return (STATUTS_DEVIS as readonly string[]).includes(value)
    ? (value as StatutDevis)
    : "brouillon";
}

export function adresseClientLignes(client: Pick<
  ClientFiche,
  "nom" | "adresse" | "code_postal" | "ville"
>): string[] {
  const lines = [client.nom.trim()].filter(Boolean);
  if (client.adresse?.trim()) lines.push(client.adresse.trim());
  const ville = [client.code_postal?.trim(), client.ville?.trim()]
    .filter(Boolean)
    .join(" ");
  if (ville) lines.push(ville);
  return lines;
}
