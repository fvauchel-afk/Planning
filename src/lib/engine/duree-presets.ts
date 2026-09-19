import { CHANTIER_DUREE_JOURS_MAX, dureeJoursMenuValues } from "@/lib/dates";
import {
  dayHoursFromJour,
  defaultHorairesSaisonEmploye,
} from "@/lib/engine/hours";
import type { Employee, PlanningSnapshot } from "@/lib/types";

export const DUREE_JOUR_PRESETS = [
  { id: "1j", label: "1 j", days: 1 },
  { id: "15j", label: "1,5 j", days: 1.5 },
  { id: "2j", label: "2 j", days: 2 },
] as const;

function typicalWeekdayHours(employee?: Employee | null): number {
  const jour =
    employee?.horaires?.ete?.jours["1"] ??
    defaultHorairesSaisonEmploye("ete").jours["1"];
  const hours = jour ? dayHoursFromJour(jour) : 0;
  return hours > 0 ? hours : 7.5;
}

export function hoursForDayPreset(
  snapshot: PlanningSnapshot,
  employeeId: string | null | undefined,
): number {
  const employee = employeeId
    ? snapshot.employees.find((item) => item.id === employeeId)
    : null;
  return typicalWeekdayHours(employee);
}

export function hoursFromDayPreset(
  snapshot: PlanningSnapshot,
  employeeId: string | null | undefined,
  days: number,
): number {
  const one = hoursForDayPreset(snapshot, employeeId);
  return Math.round(one * days * 100) / 100;
}

export function matchingDureeJoursFromHours(
  snapshot: PlanningSnapshot,
  employeeId: string | null | undefined,
  hours: number,
): number | null {
  const h = Number(hours);
  if (!Number.isFinite(h) || h <= 0) return null;
  for (const days of dureeJoursMenuValues()) {
    if (Math.abs(hoursFromDayPreset(snapshot, employeeId, days) - h) < 0.06) {
      return days;
    }
  }
  const one = hoursForDayPreset(snapshot, employeeId);
  if (one > 0 && h / one > CHANTIER_DUREE_JOURS_MAX) {
    return Math.round((h / one) * 10) / 10;
  }
  return null;
}

/** Heures → entrée du menu jours si ça colle, sinon arrondi à 0,5 près (min 0,5). */
export function daysFromPhaseHours(
  snapshot: PlanningSnapshot,
  employeeId: string | null | undefined,
  hours: number,
): number {
  const matched = matchingDureeJoursFromHours(snapshot, employeeId, hours);
  if (matched != null) return matched;
  const one = hoursForDayPreset(snapshot, employeeId);
  const h = Number(hours);
  if (!Number.isFinite(h) || h <= 0 || one <= 0) return 0.5;
  return Math.max(0.5, Math.round((h / one) * 2) / 2);
}

function runDureePresetSelfCheck() {
  const empty: PlanningSnapshot = {
    employees: [],
    chantiers: [],
    elements: [],
    phases: [],
    absences: [],
    signalements: [],
    receptions: [],
    demandes: [],
    horaires: [],
  };
  if (hoursFromDayPreset(empty, null, 1) !== 7.5) {
    throw new Error("duree-presets: 1 jour atelier (35 h été) = 7,5 h");
  }
  if (hoursFromDayPreset(empty, null, 1.5) !== 11.25) {
    throw new Error("duree-presets: 1,5 jour = 11,25 h");
  }
  if (hoursFromDayPreset(empty, null, 2) !== 15) {
    throw new Error("duree-presets: 2 jours = 15 h");
  }
  if (daysFromPhaseHours(empty, null, 7.5) !== 1) {
    throw new Error("duree-presets: 7,5 h = 1 jour");
  }
  if (daysFromPhaseHours(empty, null, 15) !== 2) {
    throw new Error("duree-presets: 15 h = 2 jours");
  }
  if (hoursFromDayPreset(empty, null, 5) !== 37.5) {
    throw new Error("duree-presets: 5 jours = 37,5 h");
  }
  if (matchingDureeJoursFromHours(empty, null, 3.75) !== 0.5) {
    throw new Error("duree-presets: 3,75 h = 0,5 jour");
  }
  if (matchingDureeJoursFromHours(empty, null, 2) != null) {
    throw new Error("duree-presets: 2 h ne collent à aucun palier jours");
  }
}
runDureePresetSelfCheck();
