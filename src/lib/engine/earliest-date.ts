import { addDays, isSunday, isoWeekday } from "@/lib/dates";
import {
  employeeWorksOnDate,
  hoursForSlot,
} from "@/lib/engine/hours";
import {
  SEARCH_DAYS,
  buildOccupancy,
  freeRangesOnDate,
  isCompanyHoliday,
  isEmployeeAbsent,
  todayIso,
} from "@/lib/engine/slots";
import type { NewChantierInput, PlanningSnapshot } from "@/lib/types";

export function inputHasExplicitDates(input: NewChantierInput): boolean {
  if (input.date_debut) return true;
  return input.elements.some((element) =>
    element.phases.some((phase) => Boolean(phase.date_debut)),
  );
}

export function earliestAvailableWorkDate(
  snapshot: PlanningSnapshot,
  fromDate = todayIso(),
): string {
  const occupancy = buildOccupancy(snapshot);
  const employees = snapshot.employees.filter((employee) => employee.actif);
  for (let i = 0; i < SEARCH_DAYS; i += 1) {
    const date = addDays(fromDate, i);
    if (isSunday(date) || isCompanyHoliday(snapshot, date)) continue;
    if (employees.length === 0) {
      if (isoWeekday(date) === 6) continue;
      return date;
    }
    const someoneFree = employees.some((employee) => {
      if (!employeeWorksOnDate(snapshot, employee, date)) return false;
      if (isEmployeeAbsent(snapshot, employee.id, date)) return false;
      const hasHours =
        hoursForSlot(snapshot, employee.id, date, 0) > 0 ||
        hoursForSlot(snapshot, employee.id, date, 1) > 0;
      if (!hasHours) return false;
      return freeRangesOnDate(occupancy, snapshot, employee.id, date).length > 0;
    });
    if (someoneFree) return date;
  }
  let fallback = fromDate;
  for (let i = 0; i < 14; i += 1) {
    if (!isSunday(fallback) && isoWeekday(fallback) !== 6) return fallback;
    fallback = addDays(fallback, 1);
  }
  return fromDate;
}

export function ensureChantierDatesOnCreate(
  snapshot: PlanningSnapshot,
  input: NewChantierInput,
): NewChantierInput {
  const explicit = inputHasExplicitDates(input);
  const datesEstimatives = explicit
    ? Boolean(input.dates_estimatives ?? true)
    : true;
  if (input.date_debut) {
    return { ...input, dates_estimatives: datesEstimatives };
  }
  if (explicit) {
    return { ...input, dates_estimatives: datesEstimatives };
  }
  return {
    ...input,
    date_debut: earliestAvailableWorkDate(snapshot),
    dates_estimatives: true,
  };
}

function runEarliestDateSelfCheck() {
  const snapshot: PlanningSnapshot = {
    employees: [
      {
        id: "emp-a",
        nom: "A",
        roles: ["fabrication"],
        actif: true,
      },
    ],
    chantiers: [],
    elements: [],
    phases: [],
    absences: [],
    signalements: [],
    receptions: [],
    demandes: [],
    horaires: [],
  };
  const monday = earliestAvailableWorkDate(snapshot, "2026-09-12");
  if (monday !== "2026-09-14") {
    throw new Error(
      `earliest-date: samedi 12 sept. 2026 doit caler au lundi 14, reçu ${monday}`,
    );
  }
  const occupied: PlanningSnapshot = {
    ...snapshot,
    absences: [
      {
        id: "abs-mon",
        employe_id: "emp-a",
        date_debut: "2026-09-14",
        date_fin: "2026-09-14",
        type: "conge",
      },
    ],
  };
  const afterBusy = earliestAvailableWorkDate(occupied, "2026-09-12");
  if (afterBusy !== "2026-09-15") {
    throw new Error(
      `earliest-date: lundi indisponible doit caler au mardi 15, reçu ${afterBusy}`,
    );
  }
  const created = ensureChantierDatesOnCreate(snapshot, {
    nom_client: "Test",
    adresse: "",
    lien_dossier_onedrive: null,
    priorite: "normal",
    elements: [
      {
        nom_element: "Portail",
        phases: [
          {
            type_phase: "fabrication",
            duree_estimee_heures: 4,
            date_debut: null,
            date_fin: null,
            employe_id: null,
            urgent: false,
          },
        ],
      },
    ],
  });
  const phase = created.elements[0]?.phases[0];
  if (!created.date_debut || created.dates_estimatives !== true) {
    throw new Error("earliest-date: sans date saisie, caler le début du chantier au plus tôt");
  }
  if (phase?.date_debut) {
    throw new Error("earliest-date: ne pas recopier la date sur toutes les phases en parallèle");
  }
  if (phase?.employe_id) {
    throw new Error("earliest-date: le calage auto ne doit pas assigner de salarié");
  }
  const kept = ensureChantierDatesOnCreate(snapshot, {
    nom_client: "Test",
    adresse: "",
    lien_dossier_onedrive: null,
    priorite: "normal",
    date_debut: "2026-10-01",
    date_fin: "2026-10-03",
    dates_estimatives: true,
    elements: [
      {
        nom_element: "Portail",
        phases: [
          {
            type_phase: "fabrication",
            duree_estimee_heures: 4,
            date_debut: null,
            date_fin: null,
            employe_id: null,
            urgent: false,
          },
        ],
      },
    ],
  });
  if (kept.date_debut !== "2026-10-01") {
    throw new Error("earliest-date: une date saisie ne doit pas être écrasée");
  }
  if (kept.dates_estimatives !== true) {
    throw new Error("earliest-date: le mode estimatif doit être conservé");
  }
}

runEarliestDateSelfCheck();
