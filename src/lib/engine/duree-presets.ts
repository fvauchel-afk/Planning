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
}
runDureePresetSelfCheck();
