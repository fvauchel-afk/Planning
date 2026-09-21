import { addDays, addWorkingDays, shiftToReach } from "@/lib/dates";
import { chantierPlanningInfo } from "@/lib/chantier-status";
import { planDelayCascade } from "@/lib/engine/delay";
import { workWindowsForRow } from "@/lib/engine/hours";
import {
  occupantsConflictWithSlots,
  slotListsOverlap,
} from "@/lib/engine/hour-grid";
import {
  mergePhaseEdits,
  previewPhaseEdits,
} from "@/lib/engine/resize-chantier";
import {
  allocateHoursFrom,
  occupySlots,
  rowIdForPhase,
  slotsFromExistingPhase,
} from "@/lib/engine/slots";
import type { Displacement } from "@/lib/engine/planner";
import type {
  PhaseEdits,
  PhaseInsert,
  PhasePatch,
  PhasePlanning,
  PlanningSnapshot,
} from "@/lib/types";

export type DurationOccupancyConflict = {
  message: string;
  displacements: Displacement[];
  delayEdits: PhaseEdits;
  interruptEdits: PhaseEdits;
  blockersInProgress: boolean;
};

function ownPhaseIds(snapshot: PlanningSnapshot, chantierId: string): Set<string> {
  const elementIds = new Set(
    snapshot.elements
      .filter((element) => element.chantier_id === chantierId)
      .map((element) => element.id),
  );
  return new Set(
    snapshot.phases
      .filter((phase) => elementIds.has(phase.element_id))
      .map((phase) => phase.id),
  );
}

function chantierIdOf(
  snapshot: PlanningSnapshot,
  phase: PhasePlanning,
): string | null {
  return (
    snapshot.elements.find((element) => element.id === phase.element_id)
      ?.chantier_id ?? null
  );
}

function listBlockers(
  snapshot: PlanningSnapshot,
  chantierId: string,
): PhasePlanning[] {
  const own = ownPhaseIds(snapshot, chantierId);
  const seen = new Set<string>();
  const blockers: PhasePlanning[] = [];
  for (const phase of snapshot.phases) {
    if (!own.has(phase.id) || !phase.date_debut) continue;
    const slots = slotsFromExistingPhase(snapshot, phase);
    if (!occupantsConflictWithSlots(snapshot, slots, own)) continue;
    for (const other of snapshot.phases) {
      if (own.has(other.id) || seen.has(other.id)) continue;
      const otherSlots = slotsFromExistingPhase(snapshot, other);
      if (!slotListsOverlap(slots, otherSlots)) continue;
      seen.add(other.id);
      blockers.push(other);
    }
  }
  return blockers;
}

function slotHours(slots: { startMin?: number; endMin?: number }[]): number {
  let minutes = 0;
  for (const slot of slots) {
    if (slot.startMin == null || slot.endMin == null) continue;
    minutes += Math.max(0, slot.endMin - slot.startMin);
  }
  return Math.round((minutes / 60) * 100) / 100;
}

function groupContiguous(
  slots: { date: string; half: 0 | 1; startMin?: number; endMin?: number }[],
): (typeof slots)[] {
  if (slots.length === 0) return [];
  const ordered = [...slots].sort((a, b) =>
    a.date === b.date ? a.half - b.half : a.date.localeCompare(b.date),
  );
  const groups: (typeof slots)[] = [[ordered[0]!]];
  for (let i = 1; i < ordered.length; i += 1) {
    const prev = ordered[i - 1]!;
    const cur = ordered[i]!;
    const adjacent =
      cur.date === prev.date || cur.date === addWorkingDays(prev.date, 1);
    if (adjacent) groups[groups.length - 1]!.push(cur);
    else groups.push([cur]);
  }
  return groups;
}

function heureFromMin(startMin: number | undefined, fallback: string | null): string | null {
  if (startMin == null) return fallback;
  const h = Math.floor(startMin / 60);
  const m = startMin % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function patchFromSlots(
  phase: PhasePlanning,
  slots: { date: string; startMin?: number }[],
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
  slots: { date: string; startMin?: number }[],
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
    statut: phase.statut,
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
    if (phase.element_id !== origin.element_id || phase.id === origin.id) continue;
    if (!phase.date_debut) continue;
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

function displacementsFromPatches(
  snapshot: PlanningSnapshot,
  patches: PhasePatch[],
  originChantierId: string,
): Displacement[] {
  const byChantier = new Map<string, Displacement>();
  for (const patch of patches) {
    const phase = snapshot.phases.find((item) => item.id === patch.id);
    if (!phase || !phase.date_debut) continue;
    const id = chantierIdOf(snapshot, phase);
    if (!id || id === originChantierId) continue;
    if (
      (patch.date_debut ?? phase.date_debut) === phase.date_debut &&
      (patch.date_fin ?? phase.date_fin) === phase.date_fin
    ) {
      continue;
    }
    const chantier = snapshot.chantiers.find((item) => item.id === id);
    if (!chantier) continue;
    const current = byChantier.get(id) ?? {
      chantier_id: id,
      nom_client: chantier.nom_client,
      priorite: chantier.priorite,
      working_days: 0,
      phases: [],
    };
    const start = patch.date_debut ?? phase.date_debut;
    current.working_days = Math.max(
      current.working_days,
      Math.abs(shiftToReach(phase.date_debut, start)),
    );
    current.phases.push({
      phase_id: phase.id,
      type_phase: phase.type_phase,
      old_debut: phase.date_debut,
      old_fin: phase.date_fin || phase.date_debut,
      date_debut: start,
      date_fin: patch.date_fin ?? phase.date_fin ?? start,
      employe_id: patch.employe_id ?? phase.employe_id,
    });
    byChantier.set(id, current);
  }
  return Array.from(byChantier.values());
}

function buildDelayEdits(
  snapshot: PlanningSnapshot,
  after: PlanningSnapshot,
  chantierId: string,
  naiveEdits: PhaseEdits,
  blockers: PhasePlanning[],
): { edits: PhaseEdits; displacements: Displacement[] } {
  const own = ownPhaseIds(after, chantierId);
  let originEnd: string | null = null;
  for (const phase of after.phases) {
    if (!own.has(phase.id) || !phase.date_fin) continue;
    if (!originEnd || phase.date_fin > originEnd) originEnd = phase.date_fin;
  }
  const byChantier = new Map<string, PhasePlanning[]>();
  for (const phase of blockers) {
    const id = chantierIdOf(snapshot, phase);
    if (!id) continue;
    const list = byChantier.get(id) ?? [];
    list.push(phase);
    byChantier.set(id, list);
  }
  let merged: PhaseEdits = { ...naiveEdits };
  let work = after;
  const displacements: Displacement[] = [];
  const wantedStart = originEnd ? addWorkingDays(originEnd, 1) : null;
  const ordered = Array.from(byChantier.entries()).sort((a, b) => {
    const aStart = a[1].map((item) => item.date_debut || "").sort()[0] ?? "";
    const bStart = b[1].map((item) => item.date_debut || "").sort()[0] ?? "";
    return aStart.localeCompare(bStart);
  });
  for (const [, phases] of ordered) {
    const first = [...phases].sort((a, b) =>
      (a.date_debut || "").localeCompare(b.date_debut || ""),
    )[0];
    if (!first?.date_debut || !wantedStart) continue;
    const days = shiftToReach(first.date_debut, wantedStart);
    if (days <= 0) continue;
    const result = planDelayCascade(work, first.id, days * 2, {
      scope: "chantier",
    });
    displacements.push(...result.displacements);
    if (result.patches.length) {
      merged = mergePhaseEdits(merged, { patches: result.patches });
      work = previewPhaseEdits(work, { patches: result.patches });
    }
  }
  return { edits: merged, displacements };
}

function buildInterruptEdits(
  snapshot: PlanningSnapshot,
  after: PlanningSnapshot,
  chantierId: string,
  naiveEdits: PhaseEdits,
): PhaseEdits {
  const own = ownPhaseIds(after, chantierId);
  const patches: PhasePatch[] = [...(naiveEdits.patches ?? [])];
  const inserts: PhaseInsert[] = [...(naiveEdits.inserts ?? [])];
  for (const phase of after.phases) {
    if (!own.has(phase.id) || !phase.date_debut || !phase.employe_id) continue;
    const slotsNaive = slotsFromExistingPhase(after, phase);
    if (!occupantsConflictWithSlots(after, slotsNaive, own)) continue;
    const rowId = rowIdForPhase(phase.type_phase, phase.employe_id);
    if (!rowId) continue;
    const original = snapshot.phases.find((item) => item.id === phase.id) ?? phase;
    const occupancy = new Map<string, string>();
    for (const other of snapshot.phases) {
      if (own.has(other.id) || other.employe_id !== phase.employe_id) continue;
      const from = other.date_debut?.slice(0, 10);
      const to = (other.date_fin || other.date_debut)?.slice(0, 10);
      if (!from || !to) continue;
      let date = from;
      while (date <= to) {
        const windows = workWindowsForRow(snapshot, rowId, date);
        occupySlots(
          occupancy,
          windows.map((window) => ({
            rowId,
            date,
            half: window.half,
            startMin: window.start,
            endMin: window.end,
          })),
          chantierIdOf(snapshot, other) ?? other.id,
        );
        date = addDays(date, 1);
      }
    }
    const startHalf =
      Number((original.heure_debut ?? "07:30").slice(0, 2)) >= 12 ? 1 : 0;
    const hours = Number(phase.duree_estimee_heures) || 0;
    const allocated = allocateHoursFrom(
      occupancy,
      snapshot,
      rowId,
      hours,
      original.date_debut!.slice(0, 10),
      startHalf,
      { short: true, allowPartial: false },
    );
    if (!allocated?.length) continue;
    const groups = groupContiguous(allocated);
    const first = groups[0]!;
    const firstPatch = patchFromSlots(phase, first, slotHours(first));
    const index = patches.findIndex((item) => item.id === phase.id);
    if (index >= 0) patches[index] = { ...patches[index]!, ...firstPatch };
    else patches.push(firstPatch);
    for (const group of groups.slice(1)) {
      inserts.push(insertFromSlots(phase, group, slotHours(group)));
    }
    const lastDate = allocated[allocated.length - 1]!.date;
    const naiveEnd = phase.date_fin || phase.date_debut!;
    patches.push(...shiftLaterPatches(after, phase, naiveEnd, lastDate));
  }
  return {
    patches: patches.length ? patches : undefined,
    inserts: inserts.length ? inserts : undefined,
    deleteIds: naiveEdits.deleteIds,
  };
}

/**
 * Après un allongement (crayon), détecte un chevauchement sur le même salarié
 * et prépare : décaler l’autre chantier, ou interrompre celui qu’on allonge.
 */
export function planDurationOccupancyConflict(
  snapshot: PlanningSnapshot,
  chantierId: string,
  naiveEdits: PhaseEdits,
): DurationOccupancyConflict | null {
  if (
    !naiveEdits.patches?.length &&
    !naiveEdits.inserts?.length &&
    !naiveEdits.deleteIds?.length
  ) {
    return null;
  }
  const after = previewPhaseEdits(snapshot, naiveEdits);
  const blockers = listBlockers(after, chantierId);
  if (blockers.length === 0) return null;

  const originChantier = snapshot.chantiers.find((item) => item.id === chantierId);
  const names = Array.from(
    new Set(
      blockers.map((phase) => {
        const id = chantierIdOf(snapshot, phase);
        return (
          snapshot.chantiers.find((item) => item.id === id)?.nom_client ??
          "un autre chantier"
        );
      }),
    ),
  );
  const blockersInProgress = blockers.some((phase) => {
    const id = chantierIdOf(snapshot, phase);
    if (!id) return phase.statut === "en_cours";
    return chantierPlanningInfo(snapshot, id).statut === "en_cours";
  });

  const delayed = buildDelayEdits(
    snapshot,
    after,
    chantierId,
    naiveEdits,
    blockers,
  );
  const displacements =
    delayed.displacements.length > 0
      ? delayed.displacements
      : displacementsFromPatches(snapshot, delayed.edits.patches ?? [], chantierId);
  const interruptEdits = buildInterruptEdits(
    snapshot,
    after,
    chantierId,
    naiveEdits,
  );
  const interruptNote = blockersInProgress
    ? " Attention : le chantier suivant est déjà en cours."
    : "";
  const otherLabel = names.length > 1 ? "ces chantiers" : names[0];
  const message = `${originChantier?.nom_client ?? "Ce chantier"} chevauche ${names.join(", ")} sur le même salarié. Vous pouvez décaler ${otherLabel}, ou ${names.length > 1 ? "les" : "le"} laisser à ${names.length > 1 ? "leur" : "sa"} place (cela interrompt ${originChantier?.nom_client ?? "le chantier en cours"}).${interruptNote}`;

  return {
    message,
    displacements,
    delayEdits: delayed.edits,
    interruptEdits,
    blockersInProgress,
  };
}

function runDurationConflictSelfCheck() {
  const snapshot: PlanningSnapshot = {
    employees: [
      { id: "emp-a", nom: "Alexis", roles: ["fabrication"], actif: true },
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
      {
        id: "ch-tech",
        nom_client: "Tech plus",
        adresse: "",
        lien_dossier_onedrive: null,
        priorite: "normal",
        date_creation: "2026-09-01",
      },
    ],
    elements: [
      { id: "el-blae", chantier_id: "ch-blae", nom_element: "Portail" },
      { id: "el-tech", chantier_id: "ch-tech", nom_element: "Portail" },
    ],
    phases: [
      {
        id: "fab-blae",
        element_id: "el-blae",
        type_phase: "fabrication",
        duree_estimee_heures: 8,
        date_debut: "2026-09-21",
        date_fin: "2026-09-21",
        heure_debut: "07:30",
        employe_id: "emp-a",
        statut: "a_faire",
        urgent: false,
      },
      {
        id: "fab-tech",
        element_id: "el-tech",
        type_phase: "fabrication",
        duree_estimee_heures: 8,
        date_debut: "2026-09-22",
        date_fin: "2026-09-22",
        heure_debut: "07:30",
        employe_id: "emp-a",
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
  const naive: PhaseEdits = {
    patches: [
      {
        id: "fab-blae",
        date_debut: "2026-09-21",
        date_fin: "2026-09-28",
        employe_id: "emp-a",
        duree_estimee_heures: 48,
        heure_debut: "07:30",
      },
    ],
  };
  const none = planDurationOccupancyConflict(snapshot, "ch-blae", {});
  if (none) throw new Error("duration-conflict: sans édition, pas de conflit");
  const conflict = planDurationOccupancyConflict(snapshot, "ch-blae", naive);
  if (!conflict) {
    throw new Error("duration-conflict: allonger Blaevoet sur Tech plus doit alerter");
  }
  if (!conflict.message.includes("Tech plus")) {
    throw new Error(`duration-conflict: citer Tech plus, reçu ${conflict.message}`);
  }
  const delayedTech = conflict.delayEdits.patches?.find((item) => item.id === "fab-tech");
  if (!delayedTech?.date_debut || delayedTech.date_debut <= "2026-09-22") {
    throw new Error(
      `duration-conflict: décaler Tech plus après Blaevoet, reçu ${delayedTech?.date_debut}`,
    );
  }
  const interrupted = previewPhaseEdits(snapshot, conflict.interruptEdits);
  const own = ownPhaseIds(interrupted, "ch-blae");
  const blae = interrupted.phases.filter((phase) => own.has(phase.id));
  for (const phase of blae) {
    const slots = slotsFromExistingPhase(interrupted, phase);
    if (occupantsConflictWithSlots(interrupted, slots, own)) {
      throw new Error("duration-conflict: interrompre ne doit plus chevaucher Tech plus");
    }
  }
}

if (typeof window === "undefined") {
  runDurationConflictSelfCheck();
}
