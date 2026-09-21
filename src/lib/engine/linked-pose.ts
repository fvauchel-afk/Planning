import { addDays, addWorkingDays, workingDaysBetween } from "@/lib/dates";
import {
  SEARCH_DAYS,
  buildOccupancy,
  isSlotBlockedForRow,
  overlappingOwners,
  slotsFromExistingPhase,
} from "@/lib/engine/slots";
import type {
  PhasePatch,
  PhasePlanning,
  PlanningSnapshot,
} from "@/lib/types";

export type LinkedPosePreview = {
  rowId: string;
  date: string;
  half: 0 | 1;
};

export type LinkedPosePlan = {
  blocked: boolean;
  patches: PhasePatch[];
  preview: LinkedPosePreview[];
  date_debut: string;
  date_fin: string;
  message: string;
};

export function linkedPosePhases(
  snapshot: PlanningSnapshot,
  phaseId: string,
): PhasePlanning[] {
  const origin = snapshot.phases.find((item) => item.id === phaseId);
  if (!origin || origin.type_phase !== "pose") return [];
  return snapshot.phases.filter(
    (phase) =>
      phase.element_id === origin.element_id && phase.type_phase === "pose",
  );
}

export function grabbedPoseFromPhaseIds(
  snapshot: PlanningSnapshot,
  phaseIds: string[],
  preferredPhaseId?: string,
): PhasePlanning | null {
  if (preferredPhaseId) {
    const preferred = snapshot.phases.find((item) => item.id === preferredPhaseId);
    if (preferred?.type_phase === "pose") return preferred;
  }
  for (const id of phaseIds) {
    const phase = snapshot.phases.find((item) => item.id === id);
    if (phase?.type_phase === "pose") return phase;
  }
  return null;
}

function employeeForLinkedPose(
  pose: PhasePlanning,
  grabbedId: string,
  grabbedEmployeeId: string,
): string | null {
  if (pose.id === grabbedId) return grabbedEmployeeId || pose.employe_id;
  return pose.employe_id;
}

function spanWorkingDays(debut: string, fin: string): number {
  return Math.max(1, 1 + workingDaysBetween(debut, fin));
}

function endFromStart(debut: string, span: number): string {
  return span <= 1 ? debut : addWorkingDays(debut, span - 1);
}

function rangeHalves(debut: string, fin: string): LinkedPosePreview[] {
  const cells: LinkedPosePreview[] = [];
  let date = debut;
  let guard = 0;
  while (date <= fin && guard < 400) {
    guard += 1;
    cells.push({ rowId: "", date, half: 0 });
    cells.push({ rowId: "", date, half: 1 });
    date = addDays(date, 1);
  }
  return cells;
}

function posesFreeTogether(
  snapshot: PlanningSnapshot,
  poses: PhasePlanning[],
  grabbedId: string,
  grabbedEmployeeId: string,
  debut: string,
  fin: string,
): boolean {
  if (!debut || !fin || fin < debut) return false;
  const ignore = new Set(poses.map((pose) => pose.id));
  const occupancy = buildOccupancy(snapshot, ignore);
  for (const pose of poses) {
    const employeeId = employeeForLinkedPose(pose, grabbedId, grabbedEmployeeId);
    if (!employeeId) return false;
    const hours = Number(pose.duree_estimee_heures) || 0;
    const slots = slotsFromExistingPhase(snapshot, {
      ...pose,
      employe_id: employeeId,
      date_debut: debut,
      date_fin: fin,
      duree_estimee_heures: hours > 0 ? hours : pose.duree_estimee_heures,
    });
    if (slots.length === 0 && hours > 0) return false;
    if (overlappingOwners(occupancy, slots).length > 0) return false;
    for (const slot of slots) {
      if (isSlotBlockedForRow(snapshot, employeeId, slot.date, slot.half)) {
        return false;
      }
    }
  }
  return true;
}

export function nextSimultaneousPoseRange(
  snapshot: PlanningSnapshot,
  poses: PhasePlanning[],
  grabbedId: string,
  grabbedEmployeeId: string,
  fromDate: string,
  span: number,
): { date_debut: string; date_fin: string } | null {
  if (poses.length === 0 || !fromDate) return null;
  let cursor = fromDate;
  for (let i = 0; i < SEARCH_DAYS; i += 1) {
    const fin = endFromStart(cursor, span);
    if (
      posesFreeTogether(
        snapshot,
        poses,
        grabbedId,
        grabbedEmployeeId,
        cursor,
        fin,
      )
    ) {
      return { date_debut: cursor, date_fin: fin };
    }
    cursor = addDays(cursor, 1);
  }
  return null;
}

export function planLinkedPoseMove(
  snapshot: PlanningSnapshot,
  grabbed: PhasePlanning,
  grabbedEmployeeId: string,
  intendedDebut: string,
  intendedFin?: string | null,
): LinkedPosePlan | null {
  const poses = linkedPosePhases(snapshot, grabbed.id);
  if (poses.length < 2) return null;
  const templateFin = grabbed.date_fin || grabbed.date_debut || intendedDebut;
  const span = spanWorkingDays(
    grabbed.date_debut || intendedDebut,
    intendedFin && intendedFin >= intendedDebut ? intendedFin : templateFin,
  );
  const start = intendedDebut || grabbed.date_debut;
  if (!start) {
    return {
      blocked: true,
      patches: [],
      preview: [],
      date_debut: "",
      date_fin: "",
      message: "Les poseurs liés n’ont pas de date de départ.",
    };
  }
  const window =
    posesFreeTogether(
      snapshot,
      poses,
      grabbed.id,
      grabbedEmployeeId,
      start,
      endFromStart(start, span),
    )
      ? { date_debut: start, date_fin: endFromStart(start, span) }
      : nextSimultaneousPoseRange(
          snapshot,
          poses,
          grabbed.id,
          grabbedEmployeeId,
          start,
          span,
        );
  if (!window) {
    return {
      blocked: true,
      patches: [],
      preview: [],
      date_debut: start,
      date_fin: endFromStart(start, span),
      message:
        "Aucun créneau où tous les poseurs de l’élément sont libres en même temps.",
    };
  }
  const patches: PhasePatch[] = poses.map((pose) => ({
    id: pose.id,
    date_debut: window.date_debut,
    date_fin: window.date_fin,
    employe_id:
      pose.id === grabbed.id
        ? grabbedEmployeeId || pose.employe_id
        : pose.employe_id,
    heure_debut: pose.heure_debut ?? grabbed.heure_debut ?? "07:30",
  }));
  const preview: LinkedPosePreview[] = [];
  for (const pose of poses) {
    const rowId =
      pose.id === grabbed.id
        ? grabbedEmployeeId || pose.employe_id || ""
        : pose.employe_id || "";
    if (!rowId) continue;
    for (const cell of rangeHalves(window.date_debut, window.date_fin)) {
      preview.push({ ...cell, rowId });
    }
  }
  const snapped = window.date_debut !== start;
  return {
    blocked: false,
    patches,
    preview,
    date_debut: window.date_debut,
    date_fin: window.date_fin,
    message: snapped
      ? `Les poseurs restent ensemble : prochain créneau commun le ${window.date_debut}.`
      : "Les poseurs de l’élément restent sur les mêmes dates.",
  };
}

function emptySnapshotFields() {
  return {
    chantiers: [] as PlanningSnapshot["chantiers"],
    elements: [] as PlanningSnapshot["elements"],
    phases: [] as PlanningSnapshot["phases"],
    absences: [] as PlanningSnapshot["absences"],
    signalements: [] as PlanningSnapshot["signalements"],
    receptions: [] as PlanningSnapshot["receptions"],
    demandes: [] as PlanningSnapshot["demandes"],
    horaires: [] as PlanningSnapshot["horaires"],
  };
}

function runLinkedPoseSelfCheck() {
  const basePhase = {
    type_phase: "pose" as const,
    duree_estimee_heures: 8,
    date_debut: "2026-09-21",
    date_fin: "2026-09-21",
    heure_debut: "07:30",
    statut: "a_faire" as const,
    urgent: false,
  };
  const snapshot: PlanningSnapshot = {
    ...emptySnapshotFields(),
    employees: [
      { id: "emp-a", nom: "A", roles: ["pose"], actif: true },
      { id: "emp-b", nom: "B", roles: ["pose"], actif: true },
      { id: "emp-c", nom: "C", roles: ["pose"], actif: true },
    ],
    elements: [{ id: "el-1", chantier_id: "ch-1", nom_element: "Pergola" }],
    phases: [
      { ...basePhase, id: "pose-a", element_id: "el-1", employe_id: "emp-a" },
      {
        ...basePhase,
        id: "pose-b",
        element_id: "el-1",
        employe_id: "emp-b",
        date_debut: "2026-09-22",
        date_fin: "2026-09-22",
      },
    ],
  };
  const linked = linkedPosePhases(snapshot, "pose-a");
  if (linked.length !== 2) {
    throw new Error("linked-pose: toutes les poses du même élément sont liées");
  }
  const moved = planLinkedPoseMove(
    snapshot,
    snapshot.phases[0]!,
    "emp-c",
    "2026-09-23",
  );
  if (!moved || moved.blocked) {
    throw new Error("linked-pose: déplacement commun le 23");
  }
  const a = moved.patches.find((item) => item.id === "pose-a");
  const b = moved.patches.find((item) => item.id === "pose-b");
  if (a?.employe_id !== "emp-c" || b?.employe_id !== "emp-b") {
    throw new Error("linked-pose: seul le poseur attrapé change de personne");
  }
  if (
    a?.date_debut !== "2026-09-23" ||
    b?.date_debut !== "2026-09-23" ||
    a.date_fin !== b.date_fin
  ) {
    throw new Error("linked-pose: mêmes dates pour tous, même si elles différaient");
  }

  const busy: PlanningSnapshot = {
    ...snapshot,
    phases: [
      ...snapshot.phases,
      {
        ...basePhase,
        id: "other-c",
        element_id: "el-x",
        employe_id: "emp-c",
        date_debut: "2026-09-23",
        date_fin: "2026-09-23",
      },
    ],
    elements: [
      ...snapshot.elements,
      { id: "el-x", chantier_id: "ch-x", nom_element: "Autre" },
    ],
  };
  const snapped = planLinkedPoseMove(
    busy,
    busy.phases[0]!,
    "emp-c",
    "2026-09-23",
  );
  if (!snapped || snapped.blocked || snapped.date_debut === "2026-09-23") {
    throw new Error(
      `linked-pose: prochain créneau commun si occupé, reçu ${snapped?.date_debut}`,
    );
  }
  if (snapped.date_debut !== snapped.patches[1]?.date_debut) {
    throw new Error("linked-pose: l’aide ne saute pas dans un trou à part");
  }
}
runLinkedPoseSelfCheck();
