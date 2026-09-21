import { idsEqual } from "@/lib/auth/ids";
import { addDays, addWorkingDays, isSunday, isoWeekday, parisCalendarYmd } from "@/lib/dates";
import { rangeEndFromHours } from "@/lib/engine/hours";
import {
  DEFAULT_LAQUAGE_WORKING_DAYS,
  firstWorkingOnOrAfter,
} from "@/lib/engine/phase-chain";
import { SEARCH_DAYS, isSlotBlockedForRow } from "@/lib/engine/slots";
import {
  TYPES_PHASE,
  type PhasePatch,
  type PhasePlanning,
  type PlanningSnapshot,
  type TypePhase,
} from "@/lib/types";

export type FinishPhaseResult = {
  patches: PhasePatch[];
};

function typeIndex(type: TypePhase): number {
  return TYPES_PHASE.indexOf(type);
}

function laterDate(left: string, right: string): string {
  return left >= right ? left : right;
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

function firstOpenDateOnOrAfter(
  snapshot: PlanningSnapshot,
  rowId: string,
  fromDate: string,
): string {
  let date = fromDate;
  for (let i = 0; i < SEARCH_DAYS; i += 1) {
    if (!isSlotBlockedForRow(snapshot, rowId, date)) return date;
    date = addDays(date, 1);
  }
  return date;
}

function scheduleAfter(
  snapshot: PlanningSnapshot,
  afterDate: string | null,
  workingDays: number,
): { start: string; end: string } {
  const start = afterDate
    ? nextWorkingDayAfter(afterDate)
    : firstWorkingOnOrAfter(
        snapshot.phases[0]?.date_debut ?? parisCalendarYmd(),
      );
  const aligned = firstWorkingOnOrAfter(start);
  return { start: aligned, end: rangeEnd(aligned, workingDays) };
}

function scheduleHoursOnAssignee(
  snapshot: PlanningSnapshot,
  employeId: string | null,
  fromDate: string,
  hours: number,
): { start: string; end: string } {
  const needed = Math.max(hours, 0);
  if (!employeId) {
    const aligned = firstWorkingOnOrAfter(fromDate);
    return {
      start: aligned,
      end: rangeEndFromHours(snapshot, null, aligned, needed),
    };
  }
  const start = firstOpenDateOnOrAfter(snapshot, employeId, fromDate);
  return {
    start,
    end: rangeEndFromHours(snapshot, employeId, start, needed),
  };
}

function toPatch(phase: PhasePlanning, extra: Partial<PhasePatch>): PhasePatch {
  return {
    id: phase.id,
    date_debut: extra.date_debut !== undefined ? extra.date_debut : phase.date_debut,
    date_fin: extra.date_fin !== undefined ? extra.date_fin : phase.date_fin,
    employe_id:
      extra.employe_id !== undefined ? extra.employe_id : phase.employe_id,
    heure_debut:
      extra.heure_debut !== undefined
        ? extra.heure_debut
        : (phase.heure_debut ?? null),
    duree_estimee_heures:
      extra.duree_estimee_heures ?? phase.duree_estimee_heures,
    statut: extra.statut ?? phase.statut,
  };
}

function datesChanged(
  phase: PhasePlanning,
  patch: Pick<PhasePatch, "date_debut" | "date_fin">,
): boolean {
  return (
    (patch.date_debut ?? null) !== (phase.date_debut ?? null) ||
    (patch.date_fin ?? null) !== (phase.date_fin ?? null)
  );
}

export function canSessionFinishPhase(
  phase: PhasePlanning,
  session: { isAdmin?: boolean; employeeId?: string | null } | null,
): boolean {
  if (!session || phase.statut === "termine") return false;
  if (session.isAdmin) return true;
  return idsEqual(phase.employe_id, session.employeeId);
}

export function clipFinishedPhaseDates(
  phase: Pick<PhasePlanning, "date_debut" | "date_fin">,
  today: string,
): { date_debut: string; date_fin: string } {
  const start = phase.date_debut?.slice(0, 10) || null;
  const debut = !start || start > today ? today : start;
  return { date_debut: debut, date_fin: today };
}

function followingPhases(
  snapshot: PlanningSnapshot,
  origin: PhasePlanning,
): PhasePlanning[] {
  const originIdx = typeIndex(origin.type_phase);
  return snapshot.phases.filter((phase) => {
    if (phase.id === origin.id) return false;
    if (phase.element_id !== origin.element_id) return false;
    if (phase.statut === "termine") return false;
    return typeIndex(phase.type_phase) > originIdx;
  });
}

function hoursForReschedule(phase: PhasePlanning): number {
  const hours = Number(phase.duree_estimee_heures) || 0;
  if (hours > 0) return hours;
  if (phase.type_phase === "livraison") return 2;
  if (phase.type_phase === "logistique") return 0;
  return 8;
}

function shouldSkipEmpty(phase: PhasePlanning): boolean {
  if (phase.type_phase === "logistique") return false;
  const hours = Number(phase.duree_estimee_heures) || 0;
  return hours <= 0 && !phase.date_debut && !phase.date_fin;
}

/**
 * Clôt une phase au jour du clic (Paris) et recale les types suivants du même
 * élément. Plusieurs lignes Pose partent en parallèle après le type précédent ;
 * terminer une Pose ne touche pas les autres Poses.
 */
export function planFinishPhase(
  snapshot: PlanningSnapshot,
  phaseId: string,
  today = parisCalendarYmd(),
): FinishPhaseResult {
  const origin = snapshot.phases.find((item) => item.id === phaseId);
  if (!origin) {
    throw new Error("Phase introuvable.");
  }
  if (origin.statut === "termine") {
    throw new Error("Cette phase est déjà terminée.");
  }

  const clipped = clipFinishedPhaseDates(origin, today);
  const patches: PhasePatch[] = [
    toPatch(origin, {
      ...clipped,
      statut: "termine",
    }),
  ];

  const following = followingPhases(snapshot, origin).filter(
    (phase) => !shouldSkipEmpty(phase),
  );
  if (following.length === 0) return { patches };

  const element = snapshot.elements.find((item) => item.id === origin.element_id);
  const chantier = element
    ? snapshot.chantiers.find((item) => item.id === element.chantier_id)
    : undefined;
  const delayDays = clampDelay(chantier?.delai_sous_traitance_jours);

  const ghostPhases = snapshot.phases.map((phase) => {
    if (phase.id === origin.id) {
      return {
        ...phase,
        date_debut: clipped.date_debut,
        date_fin: clipped.date_fin,
        statut: "termine" as const,
      };
    }
    if (following.some((item) => item.id === phase.id)) {
      return { ...phase, date_debut: null, date_fin: null };
    }
    return phase;
  });
  const ghost: PlanningSnapshot = { ...snapshot, phases: ghostPhases };

  const byType = new Map<TypePhase, PhasePlanning[]>();
  for (const type of TYPES_PHASE) {
    const group = following
      .filter((phase) => phase.type_phase === type)
      .sort((a, b) => {
        const aStart = a.date_debut ?? "";
        const bStart = b.date_debut ?? "";
        if (aStart !== bStart) return aStart.localeCompare(bStart);
        return a.id.localeCompare(b.id);
      });
    if (group.length) byType.set(type, group);
  }

  let prevEnd = clipped.date_fin;
  for (const type of TYPES_PHASE) {
    const group = byType.get(type);
    if (!group?.length) continue;

    if (type === "logistique") {
      const phase = group[0]!;
      const range = scheduleAfter(ghost, prevEnd, delayDays);
      const patch = toPatch(phase, {
        date_debut: range.start,
        date_fin: range.end,
      });
      if (datesChanged(phase, patch)) patches.push(patch);
      ghost.phases = ghost.phases.map((item) =>
        item.id === phase.id
          ? { ...item, date_debut: range.start, date_fin: range.end }
          : item,
      );
      prevEnd = range.end;
      continue;
    }

    const typeStart = nextWorkingDayAfter(prevEnd);
    const lastEndByEmployee = new Map<string, string>();
    let typeMaxEnd = prevEnd;

    for (const phase of group) {
      let from = firstWorkingOnOrAfter(typeStart);
      const employeId = phase.employe_id;
      if (employeId && lastEndByEmployee.has(employeId)) {
        from = laterDate(
          from,
          nextWorkingDayAfter(lastEndByEmployee.get(employeId)!),
        );
      }
      const range = scheduleHoursOnAssignee(
        ghost,
        employeId,
        from,
        hoursForReschedule(phase),
      );
      const patch = toPatch(phase, {
        date_debut: range.start,
        date_fin: range.end,
      });
      if (datesChanged(phase, patch)) patches.push(patch);
      ghost.phases = ghost.phases.map((item) =>
        item.id === phase.id
          ? { ...item, date_debut: range.start, date_fin: range.end }
          : item,
      );
      if (employeId) lastEndByEmployee.set(employeId, range.end);
      if (range.end > typeMaxEnd) typeMaxEnd = range.end;
    }
    prevEnd = typeMaxEnd;
  }

  return { patches };
}

function emptySnapshot(phases: PhasePlanning[]): PlanningSnapshot {
  return {
    employees: [
      { id: "emp-fab", nom: "Fab", roles: ["fabrication"], actif: true },
      { id: "emp-pose-a", nom: "Pose A", roles: ["pose"], actif: true },
      { id: "emp-pose-b", nom: "Pose B", roles: ["pose"], actif: true },
    ],
    chantiers: [
      {
        id: "ch-1",
        nom_client: "Test",
        adresse: "",
        lien_dossier_onedrive: null,
        priorite: "normal",
        date_creation: "2026-09-01",
        delai_sous_traitance_jours: 5,
      },
    ],
    elements: [{ id: "el-1", chantier_id: "ch-1", nom_element: "Portail" }],
    phases,
    absences: [],
    signalements: [],
    receptions: [],
    demandes: [],
    horaires: [],
  };
}

function basePhase(
  id: string,
  type: TypePhase,
  extra: Partial<PhasePlanning> = {},
): PhasePlanning {
  return {
    id,
    element_id: "el-1",
    type_phase: type,
    duree_estimee_heures: 8,
    date_debut: null,
    date_fin: null,
    employe_id: null,
    statut: "a_faire",
    urgent: false,
    ...extra,
  };
}

function runFinishPhaseSelfCheck() {
  const today = "2026-09-21";
  const futureFab = emptySnapshot([
    basePhase("fab-1", "fabrication", {
      date_debut: "2026-09-28",
      date_fin: "2026-09-30",
      employe_id: "emp-fab",
    }),
    basePhase("pose-a", "pose", {
      date_debut: "2026-10-12",
      date_fin: "2026-10-12",
      employe_id: "emp-pose-a",
    }),
    basePhase("pose-b", "pose", {
      date_debut: "2026-10-14",
      date_fin: "2026-10-14",
      employe_id: "emp-pose-b",
    }),
  ]);
  const early = planFinishPhase(futureFab, "fab-1", today);
  const fabPatch = early.patches.find((item) => item.id === "fab-1");
  const poseA = early.patches.find((item) => item.id === "pose-a");
  const poseB = early.patches.find((item) => item.id === "pose-b");
  if (
    fabPatch?.statut !== "termine" ||
    fabPatch.date_debut !== today ||
    fabPatch.date_fin !== today
  ) {
    throw new Error(
      `finish-phase: fab future doit se couper à ${today}, reçu ${fabPatch?.date_debut} → ${fabPatch?.date_fin} (${fabPatch?.statut})`,
    );
  }
  if (poseA?.date_debut !== "2026-09-22" || poseB?.date_debut !== "2026-09-22") {
    throw new Error(
      `finish-phase: les deux poses doivent partir en parallèle le 22, reçu ${poseA?.date_debut} / ${poseB?.date_debut}`,
    );
  }

  const pastStart = emptySnapshot([
    basePhase("fab-2", "fabrication", {
      date_debut: "2026-09-14",
      date_fin: "2026-09-25",
      employe_id: "emp-fab",
      statut: "en_cours",
    }),
  ]);
  const kept = planFinishPhase(pastStart, "fab-2", today).patches[0];
  if (kept?.date_debut !== "2026-09-14" || kept.date_fin !== today) {
    throw new Error(
      `finish-phase: garder le début réel, couper la fin à aujourd’hui, reçu ${kept?.date_debut} → ${kept?.date_fin}`,
    );
  }

  const twoPoses = emptySnapshot([
    basePhase("pose-keep", "pose", {
      date_debut: "2026-09-24",
      date_fin: "2026-09-24",
      employe_id: "emp-pose-b",
    }),
    basePhase("pose-done", "pose", {
      date_debut: "2026-09-28",
      date_fin: "2026-09-30",
      employe_id: "emp-pose-a",
    }),
  ]);
  const onePose = planFinishPhase(twoPoses, "pose-done", today);
  if (onePose.patches.some((item) => item.id === "pose-keep")) {
    throw new Error("finish-phase: terminer une Pose ne doit pas toucher l’autre");
  }
  if (
    onePose.patches[0]?.id !== "pose-done" ||
    onePose.patches[0]?.date_fin !== today ||
    onePose.patches[0]?.statut !== "termine"
  ) {
    throw new Error("finish-phase: la Pose cliquée doit se couper à aujourd’hui");
  }

  const withThermo = emptySnapshot([
    basePhase("fab-3", "fabrication", {
      date_debut: "2026-09-14",
      date_fin: "2026-09-25",
      employe_id: "emp-fab",
    }),
    basePhase("log-1", "logistique", {
      duree_estimee_heures: 40,
      date_debut: "2026-09-28",
      date_fin: "2026-10-02",
    }),
    basePhase("pose-c", "pose", {
      date_debut: "2026-10-06",
      date_fin: "2026-10-06",
      employe_id: "emp-pose-a",
    }),
  ]);
  const afterFab = planFinishPhase(withThermo, "fab-3", today);
  const log = afterFab.patches.find((item) => item.id === "log-1");
  const poseC = afterFab.patches.find((item) => item.id === "pose-c");
  if (log?.date_debut !== "2026-09-22" || log.date_fin !== "2026-09-28") {
    throw new Error(
      `finish-phase: thermo 5 j. dès le 22, reçu ${log?.date_debut} → ${log?.date_fin}`,
    );
  }
  if (poseC?.date_debut !== "2026-09-29") {
    throw new Error(
      `finish-phase: pose après thermo, reçu ${poseC?.date_debut}`,
    );
  }

  let threw = false;
  try {
    planFinishPhase(
      emptySnapshot([
        basePhase("done", "fabrication", {
          statut: "termine",
          date_debut: today,
          date_fin: today,
        }),
      ]),
      "done",
      today,
    );
  } catch {
    threw = true;
  }
  if (!threw) throw new Error("finish-phase: une phase déjà finie doit être refusée");

  const assigned = basePhase("fab-auth", "fabrication", { employe_id: "emp-fab" });
  if (
    !canSessionFinishPhase(assigned, { isAdmin: false, employeeId: "emp-fab" }) ||
    canSessionFinishPhase(assigned, { isAdmin: false, employeeId: "emp-pose-a" }) ||
    !canSessionFinishPhase(assigned, { isAdmin: true, employeeId: "other" })
  ) {
    throw new Error("finish-phase: droit admin ou salarié assigné");
  }

  if (isoWeekday(today) !== 1 || isSunday(today)) {
    throw new Error("finish-phase: le 21/09/2026 doit rester un lundi pour le contrôle");
  }
}

runFinishPhaseSelfCheck();
