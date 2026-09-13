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
import type { NewChantierInput, NewElementInput, PlanningSnapshot, TypePhase } from "@/lib/types";

export const DEFAULT_LAQUAGE_WORKING_DAYS = 5;

const PHASE_ORDER: TypePhase[] = [
  "administratif",
  "fabrication",
  "logistique",
  "pose",
];

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

function workingDaysFromHours(hours: number): number {
  const value = Number(hours) || 0;
  if (value <= 0) return 1;
  return Math.max(1, Math.ceil(value / 8));
}

function inclusiveWorkingDays(start: string, end: string): number {
  if (end <= start) return 1;
  return 1 + workingDaysBetween(start, end);
}

type PhaseInput = NewElementInput["phases"][number];

function phaseOf(phases: PhaseInput[], type: PhaseInput["type_phase"]): PhaseInput | undefined {
  return phases.find((phase) => phase.type_phase === type);
}

function laterDate(left: string, right: string): string {
  return left >= right ? left : right;
}

/**
 * Cale les phases dans l’ordre Administratif → Fabrication → Thermolaquage → Pose.
 * Chaque phase commence au jour ouvré suivant la fin de la précédente (pas de chevauchement).
 */
export function applyPhaseChainOnCreate(
  snapshot: PlanningSnapshot,
  input: NewChantierInput,
): NewChantierInput {
  const thermo = Boolean(input.avec_thermolaquage);
  const pose = Boolean(input.avec_pose);
  const delayDays = clampDelay(input.delai_laquage_jours);
  const laquageDebut = input.date_laquage_debut || null;
  const laquageFin = input.date_laquage_fin || null;
  const chainStart =
    input.date_debut || earliestAvailableWorkDate(snapshot);

  return {
    ...input,
    elements: input.elements.map((element) => {
      const phases = element.phases.map((phase) => ({ ...phase }));
      let prevEnd: string | null = null;

      for (const type of PHASE_ORDER) {
        const current = phaseOf(phases, type);
        if (!current) continue;

        const skipPose = type === "pose" && !pose;
        const skipThermo = type === "logistique" && !thermo;
        const hours = Number(current.duree_estimee_heures) || 0;
        const skipEmpty =
          type !== "logistique" && hours <= 0 && !(type === "pose" && pose);

        if (skipPose || skipThermo || skipEmpty) {
          if (skipPose || skipThermo) {
            current.date_debut = null;
            current.date_fin = null;
            if (skipThermo || skipPose) {
              current.duree_estimee_heures = 0;
            }
            if (skipThermo) current.employe_id = null;
          }
          continue;
        }

        const minStart: string = prevEnd
          ? nextWorkingDayAfter(prevEnd)
          : chainStart;

        let start = minStart;
        if (type === "logistique") {
          const requested = current.date_debut || laquageDebut;
          if (requested) start = laterDate(minStart, requested);
        } else if (current.date_debut) {
          start = laterDate(minStart, current.date_debut);
        }

        const workingDays =
          type === "logistique" ? delayDays : workingDaysFromHours(hours);
        let end = rangeEnd(start, workingDays);
        if (type === "logistique") {
          if (laquageFin && laquageFin >= start) {
            end = laterDate(end, laquageFin);
          }
          current.employe_id = null;
          if (!hours) {
            current.duree_estimee_heures =
              inclusiveWorkingDays(start, end) * 8;
          }
        } else if (current.date_fin && current.date_fin >= start) {
          end = laterDate(end, current.date_fin);
        }

        current.date_debut = start;
        current.date_fin = end < start ? start : end;
        prevEnd = current.date_fin;
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
    date_debut: "2026-09-14",
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
  const posePhase = chained.elements[0]?.phases.find((item) => item.type_phase === "pose");
  if (log?.date_debut !== "2026-09-15" || log.date_fin !== "2026-09-21") {
    throw new Error(
      `phase-chain: laquage 5 j. après fab du 14 doit aller du 15 au 21, reçu ${log?.date_debut} → ${log?.date_fin}`,
    );
  }
  if (posePhase?.date_debut !== "2026-09-22") {
    throw new Error(
      `phase-chain: pose juste après laquage, reçu ${posePhase?.date_debut}`,
    );
  }

  const parallel = applyPhaseChainOnCreate(snapshot, {
    nom_client: "Dossier 1",
    adresse: "",
    lien_dossier_onedrive: null,
    priorite: "normal",
    date_debut: "2026-09-14",
    avec_pose: true,
    avec_thermolaquage: true,
    elements: [
      {
        nom_element: "Travaux",
        phases: [
          { ...basePhase, type_phase: "administratif", duree_estimee_heures: 14 },
          { ...basePhase, type_phase: "fabrication", duree_estimee_heures: 14 },
          { ...basePhase, type_phase: "logistique", duree_estimee_heures: 0 },
          { ...basePhase, type_phase: "pose", duree_estimee_heures: 14 },
        ],
      },
    ],
  });
  const admin = parallel.elements[0]?.phases.find((item) => item.type_phase === "administratif");
  const fab = parallel.elements[0]?.phases.find((item) => item.type_phase === "fabrication");
  const thermo = parallel.elements[0]?.phases.find((item) => item.type_phase === "logistique");
  const pose14 = parallel.elements[0]?.phases.find((item) => item.type_phase === "pose");
  if (admin?.date_debut !== "2026-09-14" || admin.date_fin !== "2026-09-15") {
    throw new Error(
      `phase-chain: 14 h admin dès le 14 doit finir le 15, reçu ${admin?.date_debut} → ${admin?.date_fin}`,
    );
  }
  if (fab?.date_debut !== "2026-09-16") {
    throw new Error(
      `phase-chain: fabrication après admin, reçu ${fab?.date_debut}`,
    );
  }
  if (thermo?.date_debut !== "2026-09-18") {
    throw new Error(
      `phase-chain: thermolaquage après fabrication, reçu ${thermo?.date_debut}`,
    );
  }
  if (!pose14?.date_debut || pose14.date_debut <= (thermo?.date_fin ?? "")) {
    throw new Error(
      `phase-chain: pose après thermolaquage, reçu ${pose14?.date_debut} (thermo fin ${thermo?.date_fin})`,
    );
  }
  if (
    (admin.date_fin ?? "") >= (fab.date_debut ?? "") ||
    (fab.date_fin ?? "") >= (thermo.date_debut ?? "") ||
    (thermo.date_fin ?? "") >= (pose14.date_debut ?? "")
  ) {
    throw new Error("phase-chain: les phases ne doivent pas se chevaucher");
  }

  const noThermo = applyPhaseChainOnCreate(snapshot, {
    ...chained,
    avec_thermolaquage: false,
    avec_pose: true,
    elements: chained.elements.map((element) => ({
      ...element,
      phases: element.phases.map((phase) =>
        phase.type_phase === "pose" || phase.type_phase === "logistique"
          ? { ...phase, date_debut: null, date_fin: null, duree_estimee_heures: phase.type_phase === "pose" ? 8 : 0 }
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
    date_debut: "2026-09-14",
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
