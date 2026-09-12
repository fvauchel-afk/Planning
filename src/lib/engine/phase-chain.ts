import { addDays, addWorkingDays, isSunday, isoWeekday, workingDaysBetween } from "@/lib/dates";
import { employeeWorksOnDate, hoursForSlot } from "@/lib/engine/hours";
import {
  SEARCH_DAYS,
  buildOccupancy,
  freeRangesOnDate,
  isCompanyHoliday,
  isEmployeeAbsent,
  todayIso,
} from "@/lib/engine/slots";
import type { NewChantierInput, NewElementInput, PlanningSnapshot } from "@/lib/types";

export const DEFAULT_LAQUAGE_WORKING_DAYS = 5;

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

function clampDelay(raw: number | null | undefined): number {
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) return DEFAULT_LAQUAGE_WORKING_DAYS;
  return Math.min(60, Math.round(value));
}

function nextWorkingDayAfter(date: string): string {
  return addWorkingDays(date, 1);
}

function rangeEnd(start: string, workingDays: number): string {
  if (workingDays <= 1) return start;
  return addWorkingDays(start, workingDays - 1);
}

function inclusiveWorkingDays(start: string, end: string): number {
  if (end <= start) return 1;
  return 1 + workingDaysBetween(start, end);
}

type PhaseInput = NewElementInput["phases"][number];

function phaseOf(phases: PhaseInput[], type: PhaseInput["type_phase"]): PhaseInput | undefined {
  return phases.find((phase) => phase.type_phase === type);
}

export function applyPhaseChainOnCreate(
  snapshot: PlanningSnapshot,
  input: NewChantierInput,
): NewChantierInput {
  const thermo = Boolean(input.avec_thermolaquage);
  const pose = Boolean(input.avec_pose);
  const delayDays = clampDelay(input.delai_laquage_jours);
  const laquageDebut = input.date_laquage_debut || null;
  const laquageFin = input.date_laquage_fin || null;

  return {
    ...input,
    elements: input.elements.map((element) => {
      const phases = element.phases.map((phase) => ({ ...phase }));
      const fab = phaseOf(phases, "fabrication");
      const log = phaseOf(phases, "logistique");
      const posePhase = phaseOf(phases, "pose");

      if (log) {
        if (!thermo) {
          log.date_debut = null;
          log.date_fin = null;
          log.duree_estimee_heures = 0;
          log.employe_id = null;
        } else {
          const start =
            log.date_debut ||
            laquageDebut ||
            (fab?.date_fin || fab?.date_debut
              ? nextWorkingDayAfter((fab.date_fin || fab.date_debut) as string)
              : earliestAvailableWorkDate(snapshot));
          const end =
            log.date_fin ||
            laquageFin ||
            rangeEnd(start, delayDays);
          log.date_debut = start;
          log.date_fin = end < start ? start : end;
          log.employe_id = null;
          if (!log.duree_estimee_heures) {
            log.duree_estimee_heures = inclusiveWorkingDays(log.date_debut, log.date_fin) * 8;
          }
        }
      }

      if (posePhase) {
        if (!pose) {
          posePhase.date_debut = null;
          posePhase.date_fin = null;
          posePhase.duree_estimee_heures = 0;
        } else if (!posePhase.date_debut) {
          const after = thermo
            ? log?.date_fin || log?.date_debut
            : fab?.date_fin || fab?.date_debut;
          const rawStart = after
            ? nextWorkingDayAfter(after)
            : earliestAvailableWorkDate(snapshot);
          const start = earliestAvailableWorkDate(snapshot, rawStart);
          const hours = Number(posePhase.duree_estimee_heures) || 0;
          const extra = hours > 0 ? Math.max(0, Math.ceil(hours / 8) - 1) : 0;
          posePhase.date_debut = start;
          posePhase.date_fin = extra > 0 ? addWorkingDays(start, extra) : start;
        }
      }

      return { ...element, phases };
    }),
  };
}

function runPhaseChainSelfCheck() {
  const snapshot: PlanningSnapshot = {
    employees: [
      { id: "emp-a", nom: "A", roles: ["fabrication", "pose"], actif: true },
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
  const basePhase = {
    duree_estimee_heures: 8,
    date_debut: null as string | null,
    date_fin: null as string | null,
    employe_id: null as string | null,
    urgent: false,
  };
  const chained = applyPhaseChainOnCreate(snapshot, {
    nom_client: "Test",
    adresse: "",
    lien_dossier_onedrive: null,
    priorite: "normal",
    avec_pose: true,
    avec_thermolaquage: true,
    elements: [
      {
        nom_element: "Portail",
        phases: [
          { ...basePhase, type_phase: "administratif", duree_estimee_heures: 0 },
          {
            ...basePhase,
            type_phase: "fabrication",
            date_debut: "2026-09-14",
            date_fin: "2026-09-14",
          },
          { ...basePhase, type_phase: "logistique", duree_estimee_heures: 0 },
          { ...basePhase, type_phase: "pose", duree_estimee_heures: 8 },
        ],
      },
    ],
  });
  const log = chained.elements[0]?.phases.find((item) => item.type_phase === "logistique");
  const pose = chained.elements[0]?.phases.find((item) => item.type_phase === "pose");
  if (log?.date_debut !== "2026-09-15" || log.date_fin !== "2026-09-21") {
    throw new Error(
      `phase-chain: laquage 5 j. après fab du 14 doit aller du 15 au 21, reçu ${log?.date_debut} → ${log?.date_fin}`,
    );
  }
  if (pose?.date_debut !== "2026-09-22") {
    throw new Error(
      `phase-chain: pose juste après laquage, reçu ${pose?.date_debut}`,
    );
  }
  const noThermo = applyPhaseChainOnCreate(snapshot, {
    ...chained,
    avec_thermolaquage: false,
    avec_pose: true,
    elements: chained.elements.map((element) => ({
      ...element,
      phases: element.phases.map((phase) =>
        phase.type_phase === "pose"
          ? { ...phase, date_debut: null, date_fin: null }
          : phase,
      ),
    })),
  });
  const skippedLog = noThermo.elements[0]?.phases.find((item) => item.type_phase === "logistique");
  const poseAfterFab = noThermo.elements[0]?.phases.find((item) => item.type_phase === "pose");
  if (skippedLog?.duree_estimee_heures !== 0 || skippedLog.date_debut) {
    throw new Error("phase-chain: sans thermolaquage, pas de phase laquage");
  }
  if (poseAfterFab?.date_debut !== "2026-09-15") {
    throw new Error(
      `phase-chain: pose après fab sans laquage, reçu ${poseAfterFab?.date_debut}`,
    );
  }
  const manual = applyPhaseChainOnCreate(snapshot, {
    nom_client: "Test",
    adresse: "",
    lien_dossier_onedrive: null,
    priorite: "normal",
    avec_pose: false,
    avec_thermolaquage: true,
    delai_laquage_jours: 3,
    elements: [
      {
        nom_element: "Portail",
        phases: [
          {
            ...basePhase,
            type_phase: "fabrication",
            date_debut: "2026-09-14",
            date_fin: "2026-09-14",
          },
          { ...basePhase, type_phase: "logistique", duree_estimee_heures: 0 },
          { ...basePhase, type_phase: "pose", duree_estimee_heures: 8 },
        ],
      },
    ],
  });
  const shortLog = manual.elements[0]?.phases.find((item) => item.type_phase === "logistique");
  const noPose = manual.elements[0]?.phases.find((item) => item.type_phase === "pose");
  if (shortLog?.date_debut !== "2026-09-15" || shortLog.date_fin !== "2026-09-17") {
    throw new Error(
      `phase-chain: délai manuel 3 j. du 15 au 17, reçu ${shortLog?.date_debut} → ${shortLog?.date_fin}`,
    );
  }
  if (noPose?.date_debut || noPose?.duree_estimee_heures) {
    throw new Error("phase-chain: sans pose, la phase pose doit rester vide");
  }
}

runPhaseChainSelfCheck();
