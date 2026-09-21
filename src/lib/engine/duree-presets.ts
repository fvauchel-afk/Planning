import { addDays, CHANTIER_DUREE_JOURS_MAX, dureeJoursMenuValues, toISODate } from "@/lib/dates";
import {
  dayHoursFromJour,
  defaultHorairesSaisonEmploye,
  hoursAvailableOnRowDate,
  hoursForSlot,
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

function startDateForDuree(fromDate?: string | null): string {
  const raw = (fromDate ?? "").slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  return toISODate(new Date());
}

/** Heures d’un « jour type » (lundi été) — uniquement sans salarié ni date. */
export function hoursForDayPreset(
  snapshot: PlanningSnapshot,
  employeeId: string | null | undefined,
): number {
  const employee = employeeId
    ? snapshot.employees.find((item) => item.id === employeeId)
    : null;
  return typicalWeekdayHours(employee);
}

/**
 * Convertit un nombre de jours en heures : jour par jour, sur le contrat réel
 * de ce salarié à ces dates (pas un forfait « lundi type »).
 */
export function hoursFromDayPreset(
  snapshot: PlanningSnapshot,
  employeeId: string | null | undefined,
  days: number,
  fromDate?: string | null,
): number {
  const wanted = Number(days);
  if (!Number.isFinite(wanted) || wanted <= 0) return 0;
  if (!employeeId) {
    const one = hoursForDayPreset(snapshot, employeeId);
    return Math.round(one * wanted * 100) / 100;
  }
  const fullDays = Math.floor(wanted + 1e-9);
  const half = wanted - fullDays >= 0.45;
  let remainingFull = fullDays;
  let remainingHalf = half;
  let total = 0;
  let date = startDateForDuree(fromDate);
  for (let i = 0; i < 420 && (remainingFull > 0 || remainingHalf); i += 1) {
    const dayHours = hoursAvailableOnRowDate(snapshot, employeeId, date);
    if (dayHours <= 0) {
      date = addDays(date, 1);
      continue;
    }
    if (remainingFull > 0) {
      total += dayHours;
      remainingFull -= 1;
    } else {
      const morning = hoursForSlot(snapshot, employeeId, date, 0);
      total += morning > 0 ? morning : Math.round(dayHours * 50) / 100;
      remainingHalf = false;
    }
    date = addDays(date, 1);
  }
  return Math.round(total * 100) / 100;
}

export function matchingDureeJoursFromHours(
  snapshot: PlanningSnapshot,
  employeeId: string | null | undefined,
  hours: number,
  fromDate?: string | null,
): number | null {
  const h = Number(hours);
  if (!Number.isFinite(h) || h <= 0) return null;
  for (const days of dureeJoursMenuValues()) {
    if (
      Math.abs(hoursFromDayPreset(snapshot, employeeId, days, fromDate) - h) <
      0.06
    ) {
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
  fromDate?: string | null,
): number {
  const matched = matchingDureeJoursFromHours(
    snapshot,
    employeeId,
    hours,
    fromDate,
  );
  if (matched != null) return matched;
  const one = hoursForDayPreset(snapshot, employeeId);
  const h = Number(hours);
  if (!Number.isFinite(h) || h <= 0 || one <= 0) return 0.5;
  return Math.max(0.5, Math.round((h / one) * 2) / 2);
}

/** Garde le nombre de jours, recalcule les heures pour le nouveau salarié. */
export function hoursKeepingDayCount(
  snapshot: PlanningSnapshot,
  previousEmployeeId: string | null | undefined,
  nextEmployeeId: string | null | undefined,
  hours: number,
  fromDate?: string | null,
): string {
  const days = daysFromPhaseHours(
    snapshot,
    previousEmployeeId,
    hours,
    fromDate,
  );
  return String(hoursFromDayPreset(snapshot, nextEmployeeId, days, fromDate));
}

function emptySnapshot(): PlanningSnapshot {
  return {
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
}

function runDureePresetSelfCheck() {
  const empty = emptySnapshot();
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

  const emp35 = {
    id: "emp-35",
    nom: "Léo",
    roles: ["fabrication" as const],
    actif: true,
    horaires: {
      ete: defaultHorairesSaisonEmploye("ete"),
      hiver: defaultHorairesSaisonEmploye("hiver"),
    },
  };
  const withEmp: PlanningSnapshot = { ...empty, employees: [emp35] };
  const friday = hoursFromDayPreset(withEmp, "emp-35", 1, "2026-09-25");
  if (friday !== 5) {
    throw new Error(
      `duree-presets: 1 vendredi 35 h = 5 h (contrat du jour), reçu ${friday}`,
    );
  }
  const wedFri = hoursFromDayPreset(withEmp, "emp-35", 3, "2026-09-23");
  if (wedFri !== 20) {
    throw new Error(
      `duree-presets: mer–ven 35 h = 7,5+7,5+5 = 20 h, reçu ${wedFri}`,
    );
  }
  const kept = hoursKeepingDayCount(
    withEmp,
    null,
    "emp-35",
    22.5,
    "2026-09-23",
  );
  if (kept !== "20") {
    throw new Error(
      `duree-presets: 3 jours gardés, heures recalculées mer–ven = 20, reçu ${kept}`,
    );
  }
}
runDureePresetSelfCheck();
