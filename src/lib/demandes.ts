import {
  creneauPersistFields,
  formatCreneauCourt,
  validateAbsenceCreneau,
} from "@/lib/absence-creneau";
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

export const CATEGORIE_REUNION_DIRECTION = "reunion_direction" as const;

export function isReunionDirectionDemande(item: {
  categorie?: CategorieDemande | string;
}): boolean {
  return item.categorie === CATEGORIE_REUNION_DIRECTION;
}

export function categoriesDemandeHorsReunion(): CategorieDemande[] {
  return CATEGORIES_DEMANDE.filter((id) => id !== CATEGORIE_REUNION_DIRECTION);
}

/** Demandes du widget / onglet Demandes : plus de catégorie Commande (onglet dédié). */
export function categoriesDemandeCourantes(): CategorieDemande[] {
  return categoriesDemandeHorsReunion().filter((id) => id !== "commande");
}

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

export function demandePeutEtreSupprimee(demande: Pick<Demande, "statut">): boolean {
  return !demandeEstOuverte(demande);
}

export function syntheseMessageConge(input: {
  type_absence: TypeAbsence;
  date_debut: string;
  date_fin: string;
  motif_precision?: string | null;
  creneau?: NewDemandeInput["creneau"];
  duree_heures?: number | null;
}): string {
  const type = ABSENCE_LABELS[input.type_absence] ?? input.type_absence;
  const dates =
    input.date_fin === input.date_debut
      ? input.date_debut
      : `${input.date_debut} → ${input.date_fin}`;
  const slot = formatCreneauCourt(input);
  const when = slot ? `${dates} · ${slot}` : dates;
  const extra = input.motif_precision?.trim();
  return extra ? `${type} · ${when}\n${extra}` : `${type} · ${when}`;
}

export function absenceInputFromDemande(
  demande: Demande,
): NewAbsenceInput | null {
  if (demande.categorie !== "conge") return null;
  const type = demande.type_absence;
  const debut = demande.date_debut?.slice(0, 10) ?? "";
  const fin = demande.date_fin?.slice(0, 10) ?? "";
  if (!type || !debut || !fin) return null;
  const creneau = creneauPersistFields({
    creneau: demande.creneau,
    duree_heures: demande.duree_heures,
    type,
  });
  return {
    employe_id: demande.employe_id,
    type,
    date_debut: debut,
    date_fin: fin,
    motif_precision:
      type === "autre" ? demande.motif_precision?.trim() || null : null,
    creneau: creneau.creneau,
    duree_heures: creneau.duree_heures,
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
  return validateAbsenceCreneau({
    creneau: input.creneau,
    duree_heures: input.duree_heures,
    type: input.type_absence,
  });
}

function runDemandesSelfCheck() {
  if (parseCategorieDemande("conge") !== "conge") {
    throw new Error("demandes: catégorie congé");
  }
  if (parseCategorieDemande("reunion_direction") !== "reunion_direction") {
    throw new Error("demandes: catégorie réunion direction");
  }
  if (isReunionDirectionDemande({ categorie: "commande" })) {
    throw new Error("demandes: une commande n’est pas un sujet de réunion");
  }
  if (categoriesDemandeHorsReunion().includes("reunion_direction")) {
    throw new Error("demandes: la réunion ne doit pas apparaître dans Demandes");
  }
  if (categoriesDemandeCourantes().includes("commande")) {
    throw new Error("demandes: la commande ne doit plus apparaître dans Demandes");
  }
  if (parseStatutDemande("acceptee") !== "acceptee") {
    throw new Error("demandes: statut acceptée");
  }
  if (demandeEstOuverte({ statut: "acceptee" })) {
    throw new Error("demandes: une demande acceptée n’est plus ouverte");
  }
  if (!demandePeutEtreSupprimee({ statut: "acceptee" })) {
    throw new Error("demandes: une demande acceptée peut être supprimée");
  }
  if (!demandePeutEtreSupprimee({ statut: "refusee" })) {
    throw new Error("demandes: une demande refusée peut être supprimée");
  }
  if (!demandePeutEtreSupprimee({ statut: "traite" })) {
    throw new Error("demandes: une demande traitée peut être supprimée");
  }
  if (demandePeutEtreSupprimee({ statut: "en_attente" })) {
    throw new Error("demandes: une demande en attente ne se supprime pas");
  }
  const synthese = syntheseMessageConge({
    type_absence: "conge",
    date_debut: "2026-09-17",
    date_fin: "2026-09-18",
  });
  if (!synthese.trim() || !synthese.includes("2026-09-17")) {
    throw new Error("demandes: synthèse congé vide");
  }
  if (
    validateDemandeCongeInput({
      categorie: "conge",
      message: "",
      date_debut: "2026-09-17",
      date_fin: "2026-09-18",
      type_absence: "conge",
    })
  ) {
    throw new Error("demandes: un congé daté sans commentaire doit être valide");
  }
  if (
    !validateDemandeCongeInput({
      categorie: "conge",
      message: "",
      date_debut: "2026-09-17",
      date_fin: "2026-09-18",
      type_absence: "conge",
      creneau: "heures",
    })
  ) {
    throw new Error("demandes: des heures sans durée doivent être refusées");
  }
}

runDemandesSelfCheck();
