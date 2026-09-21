import { addWorkingDays, shiftToReach } from "@/lib/dates";
import { chantierPlanningInfo } from "@/lib/chantier-status";
import { hoursInSlots } from "@/lib/engine/hours";
import { slotListsOverlap } from "@/lib/engine/hour-grid";
import { previewPhaseEdits } from "@/lib/engine/resize-chantier";
import type { SlotConflict } from "@/lib/engine/planner";
import {
  advanceSlot,
  allocateHoursFrom,
  buildOccupancy,
  compareSlots,
  nextOpenSlot,
  occupySlots,
  overlappingOwners,
  rowIdForPhase,
  slotsFromExistingPhase,
  type OccupiedSlot,
} from "@/lib/engine/slots";
import {
  TYPES_PHASE,
  type PhaseEdits,
  type PhaseInsert,
  type PhasePatch,
  type PhasePlanning,
  type PlanningSnapshot,
  type TypePhase,
} from "@/lib/types";

export type SplitInsertPlan = {
  edits: PhaseEdits;
  names: string[];
  prioritaire: boolean;
  inProgress: boolean;
};

function chantierIdOf(
  snapshot: PlanningSnapshot,
  phase: PhasePlanning,
): string | null {
  return (
    snapshot.elements.find((element) => element.id === phase.element_id)
      ?.chantier_id ?? null
  );
}

function overlappingPhases(
  snapshot: PlanningSnapshot,
  conflict: SlotConflict,
): PhasePlanning[] {
  if (!conflict.employe_id) return [];
  const incoming = slotsFromExistingPhase(snapshot, {
    type_phase: conflict.type_phase,
    employe_id: conflict.employe_id,
    date_debut: conflict.date_debut,
    date_fin: conflict.date_fin,
    duree_estimee_heures: 8,
  });
  return snapshot.phases.filter((phase) => {
    if (phase.employe_id !== conflict.employe_id || !phase.date_debut) {
      return false;
    }
    return slotListsOverlap(incoming, slotsFromExistingPhase(snapshot, phase));
  });
}

function heureFromMin(
  startMin: number | undefined,
  fallback: string | null,
): string | null {
  if (startMin == null) return fallback;
  const h = Math.floor(startMin / 60);
  const m = startMin % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function patchFromSlots(
  phase: PhasePlanning,
  slots: OccupiedSlot[],
  hours: number,
): PhasePatch {
  const first = slots[0]!;
  const last = slots[slots.length - 1]!;
  return {
    id: phase.id,
    date_debut: first.date,
    date_fin: last.date,
    employe_id: phase.employe_id,
    heure_debut: heureFromMin(first.startMin, phase.heure_debut ?? null),
    duree_estimee_heures: hours,
  };
}

function insertFromSlots(
  phase: PhasePlanning,
  slots: OccupiedSlot[],
  hours: number,
): PhaseInsert {
  const first = slots[0]!;
  const last = slots[slots.length - 1]!;
  return {
    element_id: phase.element_id,
    type_phase: phase.type_phase,
    duree_estimee_heures: hours,
    date_debut: first.date,
    date_fin: last.date,
    heure_debut: heureFromMin(first.startMin, phase.heure_debut ?? null),
    employe_id: phase.employe_id,
    statut: phase.statut === "termine" ? "a_faire" : phase.statut,
    urgent: phase.urgent,
    heures_supplementaires_par_jour: phase.heures_supplementaires_par_jour ?? 0,
    dates_estimatives: phase.dates_estimatives,
  };
}

function shiftLaterPatches(
  snapshot: PlanningSnapshot,
  origin: PhasePlanning,
  fromEnd: string,
  toEnd: string,
): PhasePatch[] {
  const days = shiftToReach(fromEnd, toEnd);
  if (days === 0) return [];
  const patches: PhasePatch[] = [];
  for (const phase of snapshot.phases) {
    if (phase.element_id !== origin.element_id || phase.id === origin.id) {
      continue;
    }
    if (!phase.date_debut) continue;
    const originIdx = TYPES_PHASE.indexOf(origin.type_phase as TypePhase);
    const otherIdx = TYPES_PHASE.indexOf(phase.type_phase as TypePhase);
    if (otherIdx <= originIdx) continue;
    patches.push({
      id: phase.id,
      date_debut: addWorkingDays(phase.date_debut, days),
      date_fin: addWorkingDays(phase.date_fin || phase.date_debut, days),
      employe_id: phase.employe_id,
      heure_debut: phase.heure_debut ?? null,
    });
  }
  return patches;
}

function incomingSlots(
  snapshot: PlanningSnapshot,
  conflict: SlotConflict,
): OccupiedSlot[] {
  if (!conflict.employe_id) return [];
  return slotsFromExistingPhase(snapshot, {
    type_phase: conflict.type_phase,
    employe_id: conflict.employe_id,
    date_debut: conflict.date_debut,
    date_fin: conflict.date_fin,
    duree_estimee_heures: 8,
  });
}

/**
 * Coupe le chantier déjà sur le créneau forcé : 1re moitié avant,
 * insertion du nouveau, 2e moitié (heures restantes) juste après.
 * Les phases suivantes du même élément reculent si la fin recule.
 */
export function planSplitInsert(
  snapshot: PlanningSnapshot,
  conflict: SlotConflict,
): SplitInsertPlan | null {
  const blockers = overlappingPhases(snapshot, conflict);
  if (blockers.length === 0 || !conflict.employe_id) return null;
  const incoming = incomingSlots(snapshot, conflict);
  if (incoming.length === 0) return null;
  const incomingFirst = [...incoming].sort(compareSlots)[0]!;
  const incomingLast = [...incoming].sort(compareSlots).at(-1)!;
  const afterIncoming = advanceSlot(incomingLast.date, incomingLast.half);

  const skip = new Set(blockers.map((phase) => phase.id));
  const occupancy = buildOccupancy(snapshot, skip);
  occupySlots(occupancy, incoming, "incoming");

  const patches: PhasePatch[] = [];
  const inserts: PhaseInsert[] = [];
  const names = new Set<string>();
  let prioritaire = false;
  let inProgress = false;

  const ordered = [...blockers].sort((a, b) =>
    (a.date_debut || "").localeCompare(b.date_debut || ""),
  );
  for (const phase of ordered) {
    const chantierId = chantierIdOf(snapshot, phase);
    const chantier = snapshot.chantiers.find((item) => item.id === chantierId);
    if (chantier) {
      names.add(chantier.nom_client);
      if (chantier.priorite === "prioritaire") prioritaire = true;
      if (chantierPlanningInfo(snapshot, chantier.id).statut === "en_cours") {
        inProgress = true;
      }
    }
    const rowId = rowIdForPhase(phase.type_phase, phase.employe_id);
    if (!rowId) continue;
    const allSlots = slotsFromExistingPhase(snapshot, phase).sort(compareSlots);
    const totalHours = hoursInSlots(snapshot, allSlots);
    const before = allSlots.filter((slot) => compareSlots(slot, incomingFirst) < 0);
    const beforeHours = hoursInSlots(snapshot, before);
    const restHours = Math.round((totalHours - beforeHours) * 100) / 100;
    if (restHours <= 0 && before.length === 0) continue;

    const start = nextOpenSlot(
      snapshot,
      rowId,
      afterIncoming.date,
      afterIncoming.half,
    );
    const remaining =
      restHours > 0
        ? allocateHoursFrom(
            occupancy,
            snapshot,
            rowId,
            restHours,
            start.date,
            start.half,
            { short: true, allowPartial: false },
          )
        : [];
    if (restHours > 0 && !remaining?.length) return null;

    if (before.length > 0 && remaining && remaining.length > 0) {
      patches.push(patchFromSlots(phase, before, beforeHours));
      occupySlots(occupancy, before, chantierId ?? phase.id);
      inserts.push(insertFromSlots(phase, remaining, restHours));
      occupySlots(occupancy, remaining, chantierId ?? phase.id);
    } else if (remaining && remaining.length > 0) {
      patches.push(patchFromSlots(phase, remaining, restHours));
      occupySlots(occupancy, remaining, chantierId ?? phase.id);
    } else if (before.length > 0) {
      patches.push(patchFromSlots(phase, before, beforeHours));
      occupySlots(occupancy, before, chantierId ?? phase.id);
    }

    const oldEnd = phase.date_fin || phase.date_debut!;
    const newEnd = remaining?.length
      ? remaining[remaining.length - 1]!.date
      : before.at(-1)?.date ?? oldEnd;
    patches.push(...shiftLaterPatches(snapshot, phase, oldEnd, newEnd));
  }

  if (patches.length === 0 && inserts.length === 0) return null;
  return {
    edits: {
      patches: patches.length ? patches : undefined,
      inserts: inserts.length ? inserts : undefined,
    },
    names: Array.from(names),
    prioritaire,
    inProgress,
  };
}

function runSplitInsertSelfCheck() {
  const snapshot: PlanningSnapshot = {
    employees: [
      { id: "alexis", nom: "Alexis", roles: ["fabrication", "pose"], actif: true },
    ],
    chantiers: [
      {
        id: "ch-blae",
        nom_client: "Blaevoet",
        adresse: "",
        lien_dossier_onedrive: null,
        priorite: "normal",
        date_creation: "2026-09-01",
      },
    ],
    elements: [{ id: "el-blae", chantier_id: "ch-blae", nom_element: "Portail" }],
    phases: [
      {
        id: "fab-blae",
        element_id: "el-blae",
        type_phase: "fabrication",
        duree_estimee_heures: 16,
        date_debut: "2026-09-21",
        date_fin: "2026-09-22",
        heure_debut: "07:30",
        employe_id: "alexis",
        statut: "a_faire",
        urgent: false,
      },
    ],
    absences: [],
    signalements: [],
    receptions: [],
    demandes: [],
    horaires: [],
  };
  const conflict: SlotConflict = {
    elementIndex: 0,
    nom_element: "Sécurisation",
    type_phase: "pose",
    employe_id: "alexis",
    date_debut: "2026-09-21",
    date_fin: "2026-09-21",
    occupiedBy: "Blaevoet",
    nextFree: null,
    overtime: null,
    alternatives: [],
    message: "chevauche Blaevoet",
  };
  const occupancyBefore = buildOccupancy(snapshot);
  const incoming = incomingSlots(snapshot, conflict);
  if (overlappingOwners(occupancyBefore, incoming).length === 0) {
    throw new Error("split-insert: Tech plus le 21 doit chevaucher Blaevoet");
  }
  const plan = planSplitInsert(snapshot, conflict);
  if (!plan) throw new Error("split-insert: doit proposer de couper Blaevoet");
  if (!plan.names.includes("Blaevoet")) {
    throw new Error("split-insert: citer Blaevoet");
  }
  const after = previewPhaseEdits(snapshot, plan.edits);
  const blae = after.phases.filter((phase) => phase.element_id === "el-blae");
  for (const phase of blae) {
    const slots = slotsFromExistingPhase(after, phase);
    if (slotListsOverlap(slots, incoming)) {
      throw new Error("split-insert: Blaevoet ne doit plus occuper le lundi 21");
    }
  }
  const origHours = hoursInSlots(
    snapshot,
    slotsFromExistingPhase(snapshot, snapshot.phases[0]!),
  );
  const newHours = blae.reduce(
    (sum, phase) => sum + hoursInSlots(after, slotsFromExistingPhase(after, phase)),
    0,
  );
  if (Math.abs(newHours - origHours) > 0.2) {
    throw new Error(
      `split-insert: conserver les heures Blaevoet (${origHours}), reçu ${newHours}`,
    );
  }
  const starts = blae.map((phase) => phase.date_debut || "").sort();
  if (starts[0] && starts[0] <= "2026-09-21") {
    throw new Error(
      `split-insert: la suite Blaevoet reprend après le 21, reçu ${starts.join(",")}`,
    );
  }
}

if (typeof window === "undefined") {
  runSplitInsertSelfCheck();
}
