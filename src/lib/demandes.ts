import {
  CATEGORIES_DEMANDE,
  STATUTS_DEMANDE,
  TYPES_ABSENCE,
  ABSENCE_LABELS,
  type CategorieDemande,
  type Demande,
  type NewAbsenceInput,
  type NewDemandeInput,
  type StatutDemande,
  type TypeAbsence,
} from "@/lib/types";

export function parseCategorieDemande(value: unknown): CategorieDemande {
  if (
    typeof value === "string" &&
    (CATEGORIES_DEMANDE as readonly string[]).includes(value)
  ) {
    return value as CategorieDemande;
  }
  return "commande";
}

export function parseStatutDemande(value: unknown): StatutDemande {
  if (
    typeof value === "string" &&
    (STATUTS_DEMANDE as readonly string[]).includes(value)
  ) {
    return value as StatutDemande;
  }
  return "en_attente";
}

export function parseTypeAbsence(value: unknown): TypeAbsence | null {
  if (
    typeof value === "string" &&
    (TYPES_ABSENCE as readonly string[]).includes(value)
  ) {
    return value as TypeAbsence;
  }
  return null;
}

export function demandeEstOuverte(demande: Pick<Demande, "statut">): boolean {
  return demande.statut === "en_attente";
}

export function syntheseMessageConge(input: {
  type_absence: TypeAbsence;
  date_debut: string;
  date_fin: string;
  motif_precision?: string | null;
}): string {
  const type = ABSENCE_LABELS[input.type_absence] ?? input.type_absence;
  const dates =
    input.date_fin === input.date_debut
      ? input.date_debut
      : `${input.date_debut} → ${input.date_fin}`;
  const extra = input.motif_precision?.trim();
  return extra ? `${type} · ${dates}\n${extra}` : `${type} · ${dates}`;
}

export function absenceInputFromDemande(
  demande: Demande,
): NewAbsenceInput | null {
  if (demande.categorie !== "conge") return null;
  const type = demande.type_absence;
  const debut = demande.date_debut?.slice(0, 10) ?? "";
  const fin = demande.date_fin?.slice(0, 10) ?? "";
  if (!type || !debut || !fin) return null;
  return {
    employe_id: demande.employe_id,
    type,
    date_debut: debut,
    date_fin: fin,
    motif_precision:
      type === "autre" ? demande.motif_precision?.trim() || null : null,
  };
}

export function validateDemandeCongeInput(input: NewDemandeInput): string | null {
  const debut = input.date_debut?.slice(0, 10) ?? "";
  const fin = input.date_fin?.slice(0, 10) ?? "";
  if (!debut || !fin) return "Indiquez les dates de début et de fin.";
  if (fin < debut) return "La date de fin doit être après la date de début.";
  if (!input.type_absence) return "Choisissez un type d’absence.";
  if (
    !(TYPES_ABSENCE as readonly string[]).includes(input.type_absence)
  ) {
    return "Type d’absence invalide.";
  }
  if (input.type_absence === "autre" && !input.motif_precision?.trim()) {
    return "Précisez le motif pour une absence de type « Autre ».";
  }
  return null;
}

function runDemandesSelfCheck() {
  if (parseCategorieDemande("conge") !== "conge") {
    throw new Error("demandes: catégorie congé");
  }
  if (parseStatutDemande("acceptee") !== "acceptee") {
    throw new Error("demandes: statut acceptée");
  }
  if (demandeEstOuverte({ statut: "acceptee" })) {
    throw new Error("demandes: une demande acceptée n’est plus ouverte");
  }
}

runDemandesSelfCheck();
