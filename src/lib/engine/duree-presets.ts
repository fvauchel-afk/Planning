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

/** Heures enregistrées → jours ouvrés (arrondi), min 1. */
export function daysFromPhaseHours(
  snapshot: PlanningSnapshot,
  employeeId: string | null | undefined,
  hours: number,
): number {
  const one = hoursForDayPreset(snapshot, employeeId);
  const h = Number(hours);
  if (!Number.isFinite(h) || h <= 0 || one <= 0) return 1;
  return Math.max(1, Math.round(h / one));
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
}
runDureePresetSelfCheck();
