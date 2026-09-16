import type { Chantier, Priorite } from "@/lib/types";

export const PRIORITY_RANK: Record<Priorite, number> = {
  pas_presse: 0,
  normal: 1,
  prioritaire: 2,
};

/** ± 2 semaines pour Normal. */
export const TOLERANCE_NORMAL_JOURS = 14;
/** ± 1 mois par défaut pour Pas pressé. */
export const TOLERANCE_PAS_PRESSE_JOURS_DEFAUT = 30;

export function moisToToleranceJours(mois: number): number {
  const value = Number(mois);
  if (!Number.isFinite(value) || value <= 0) return TOLERANCE_PAS_PRESSE_JOURS_DEFAUT;
  return Math.min(180, Math.round(value * 30));
}

export function toleranceJoursToMois(jours: number | null | undefined): number {
  const value = Number(jours);
  if (!Number.isFinite(value) || value <= 0) return 1;
  return Math.max(1, Math.round(value / 30));
}

export function chantierToleranceCalendarDays(
  chantier: Pick<Chantier, "priorite"> & {
    tolerance_deplacement_jours?: number | null;
  },
): number {
  if (chantier.priorite === "prioritaire") return 0;
  const custom = Number(chantier.tolerance_deplacement_jours);
  if (Number.isFinite(custom) && custom > 0) {
    return Math.min(180, Math.round(custom));
  }
  if (chantier.priorite === "normal") return TOLERANCE_NORMAL_JOURS;
  return TOLERANCE_PAS_PRESSE_JOURS_DEFAUT;
}

/** Marge par défaut du formulaire « date cible ± jours » (jours ouvrés). */
export function delayWindowFlexDays(
  chantier: Pick<Chantier, "priorite"> & {
    tolerance_deplacement_jours?: number | null;
  },
): number {
  if (chantier.priorite === "prioritaire") return 0;
  const custom = Number(chantier.tolerance_deplacement_jours);
  if (Number.isFinite(custom) && custom >= 0) {
    return Math.min(30, Math.max(0, Math.round(custom)));
  }
  return 3;
}

/** Jours ouvrés approximatifs pour caper un décalage de l’algorithme. */
export function chantierToleranceWorkingDays(
  chantier: Pick<Chantier, "priorite"> & {
    tolerance_deplacement_jours?: number | null;
  },
): number {
  const calendar = chantierToleranceCalendarDays(chantier);
  if (calendar <= 0) return 0;
  return Math.max(1, Math.round((calendar * 5) / 7));
}

export function toleranceLabel(
  chantier: Pick<Chantier, "priorite"> & {
    tolerance_deplacement_jours?: number | null;
  },
): string {
  if (chantier.priorite === "prioritaire") {
    return "date à tenir exactement";
  }
  if (chantier.priorite === "normal") {
    return "± 2 semaines";
  }
  const mois = toleranceJoursToMois(chantierToleranceCalendarDays(chantier));
  return `± ${mois} mois`;
}

export function canPriorityDisplace(
  existing: Priorite,
  incoming: Priorite,
): boolean {
  if (existing === "prioritaire") return false;
  return PRIORITY_RANK[incoming] >= PRIORITY_RANK[existing];
}

function runPrioriteSelfCheck() {
  if (canPriorityDisplace("prioritaire", "prioritaire")) {
    throw new Error("priorite: un prioritaire ne se déplace pas");
  }
  if (canPriorityDisplace("prioritaire", "normal")) {
    throw new Error("priorite: un normal ne pousse pas un prioritaire");
  }
  if (!canPriorityDisplace("normal", "prioritaire")) {
    throw new Error("priorite: un prioritaire peut pousser un normal");
  }
  if (!canPriorityDisplace("pas_presse", "normal")) {
    throw new Error("priorite: un normal peut pousser un pas pressé");
  }
  if (canPriorityDisplace("normal", "pas_presse")) {
    throw new Error("priorite: un pas pressé ne pousse pas un normal");
  }
  if (chantierToleranceWorkingDays({ priorite: "prioritaire" }) !== 0) {
    throw new Error("priorite: prioritaire sans marge");
  }
  if (chantierToleranceCalendarDays({ priorite: "normal" }) !== 14) {
    throw new Error("priorite: normal = 2 semaines");
  }
  if (
    chantierToleranceCalendarDays({
      priorite: "normal",
      tolerance_deplacement_jours: 3,
    }) !== 3
  ) {
    throw new Error("priorite: marge saisie utilisée aussi en normal");
  }
  if (
    chantierToleranceCalendarDays({
      priorite: "pas_presse",
      tolerance_deplacement_jours: 60,
    }) !== 60
  ) {
    throw new Error("priorite: pas pressé utilise la marge saisie");
  }
  if (delayWindowFlexDays({ priorite: "normal" }) !== 3) {
    throw new Error("priorite: flex décalage par défaut = 3 j");
  }
  if (
    delayWindowFlexDays({
      priorite: "normal",
      tolerance_deplacement_jours: 3,
    }) !== 3
  ) {
    throw new Error("priorite: flex décalage lit tolerance_deplacement_jours");
  }
}
runPrioriteSelfCheck();
