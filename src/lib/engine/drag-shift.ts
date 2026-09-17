import { addDays, parseISODate } from "@/lib/dates";
import { hoursForSlot } from "@/lib/engine/hours";
import {
  isEmployeeAbsent,
  isSlotBlockedForRow,
  slotsFromExistingPhase,
  type Half,
} from "@/lib/engine/slots";
import { isVirtualPlanningRow, type PhasePatch, type PlanningSnapshot } from "@/lib/types";

export type OccupiedHalf = { date: string; half: Half };

export type DragShiftPreviewCell = {
  rowId: string;
  date: string;
  half: Half;
};

export type ChantierBlock = {
  key: string;
  rowId: string;
  chantierId: string;
  halves: OccupiedHalf[];
  phaseIds: string[];
};

export function halfIndex(date: string, half: Half): number {
  const day = parseISODate(date);
  const utc = Date.UTC(day.getFullYear(), day.getMonth(), day.getDate());
  return (utc / 86400000) * 2 + half;
}

export function addHalfSteps(
  date: string,
  half: Half,
  delta: number,
): OccupiedHalf {
  const abs = Math.abs(delta);
  const dir = delta >= 0 ? 1 : -1;
  let nextDate = date;
  let nextHalf: Half = half;
  for (let i = 0; i < abs; i += 1) {
    if (dir > 0) {
      if (nextHalf === 0) nextHalf = 1;
      else {
        nextDate = addDays(nextDate, 1);
        nextHalf = 0;
      }
    } else if (nextHalf === 1) {
      nextHalf = 0;
    } else {
      nextDate = addDays(nextDate, -1);
      nextHalf = 1;
    }
  }
  return { date: nextDate, half: nextHalf };
}

export function compareHalves(left: OccupiedHalf, right: OccupiedHalf): number {
  return halfIndex(left.date, left.half) - halfIndex(right.date, right.half);
}

function isWorkHalf(
  snapshot: PlanningSnapshot,
  rowId: string,
  date: string,
  half: Half,
): boolean {
  if (hoursForSlot(snapshot, rowId, date, half) <= 0) return false;
  if (!isVirtualPlanningRow(rowId) && isEmployeeAbsent(snapshot, rowId, date)) {
    return false;
  }
  return true;
}

function hasWorkGap(
  snapshot: PlanningSnapshot,
  rowId: string,
  occupancy: Map<string, string>,
  from: OccupiedHalf,
  to: OccupiedHalf,
  allowChantierId: string,
): boolean {
  let cursor = addHalfSteps(from.date, from.half, 1);
  while (compareHalves(cursor, to) < 0) {
    if (isWorkHalf(snapshot, rowId, cursor.date, cursor.half)) {
      const owner = occupancy.get(`${cursor.date}|${cursor.half}`);
      if (!owner || owner !== allowChantierId) return true;
    }
    cursor = addHalfSteps(cursor.date, cursor.half, 1);
  }
  return false;
}

function occupancyForRow(
  snapshot: PlanningSnapshot,
  rowId: string,
): { occupancy: Map<string, string>; cells: { half: OccupiedHalf; chantierId: string; phaseId: string }[] } {
  const occupancy = new Map<string, string>();
  const cells: { half: OccupiedHalf; chantierId: string; phaseId: string }[] = [];
  for (const phase of snapshot.phases) {
    const element = snapshot.elements.find((item) => item.id === phase.element_id);
    if (!element) continue;
    for (const slot of slotsFromExistingPhase(snapshot, phase)) {
      if (slot.rowId !== rowId) continue;
      const key = `${slot.date}|${slot.half}`;
      occupancy.set(key, element.chantier_id);
      cells.push({
        half: { date: slot.date, half: slot.half },
        chantierId: element.chantier_id,
        phaseId: phase.id,
      });
    }
  }
  cells.sort((left, right) => compareHalves(left.half, right.half));
  return { occupancy, cells };
}

export function chantierBlocksForRow(
  snapshot: PlanningSnapshot,
  rowId: string,
): ChantierBlock[] {
  const { occupancy, cells } = occupancyForRow(snapshot, rowId);
  if (cells.length === 0) return [];
  const blocks: ChantierBlock[] = [];
  let current: {
    chantierId: string;
    halves: OccupiedHalf[];
    phaseIds: Set<string>;
  } | null = null;

  const flush = () => {
    if (!current || current.halves.length === 0) return;
    const start = current.halves[0]!;
    blocks.push({
      key: `${rowId}|${current.chantierId}|${start.date}|${start.half}`,
      rowId,
      chantierId: current.chantierId,
      halves: current.halves,
      phaseIds: Array.from(current.phaseIds),
    });
  };

  for (const cell of cells) {
    if (
      current &&
      current.chantierId === cell.chantierId &&
      !hasWorkGap(
        snapshot,
        rowId,
        occupancy,
        current.halves[current.halves.length - 1]!,
        cell.half,
        current.chantierId,
      )
    ) {
      const last = current.halves[current.halves.length - 1]!;
      if (compareHalves(last, cell.half) !== 0) current.halves.push(cell.half);
      current.phaseIds.add(cell.phaseId);
      continue;
    }
    flush();
    current = {
      chantierId: cell.chantierId,
      halves: [cell.half],
      phaseIds: new Set([cell.phaseId]),
    };
  }
  flush();
  return blocks;
}

export function blockContaining(
  blocks: ChantierBlock[],
  chantierId: string,
  date: string,
  half: Half,
): ChantierBlock | null {
  return (
    blocks.find(
      (block) =>
        block.chantierId === chantierId &&
        block.halves.some(
          (item) => item.date === date && item.half === half,
        ),
    ) ?? null
  );
}

function gluedNeighbors(
  snapshot: PlanningSnapshot,
  occupancy: Map<string, string>,
  blocks: ChantierBlock[],
  origin: ChantierBlock,
  direction: 1 | -1,
): ChantierBlock[] {
  const ordered = [...blocks].sort((left, right) =>
    compareHalves(left.halves[0]!, right.halves[0]!),
  );
  const startIndex = ordered.findIndex((item) => item.key === origin.key);
  if (startIndex < 0) return [];
  const chain: ChantierBlock[] = [];
  let cursor = origin;
  if (direction > 0) {
    for (let i = startIndex + 1; i < ordered.length; i += 1) {
      const next = ordered[i]!;
      const from = cursor.halves[cursor.halves.length - 1]!;
      const to = next.halves[0]!;
      if (hasWorkGap(snapshot, origin.rowId, occupancy, from, to, next.chantierId)) {
        break;
      }
      chain.push(next);
      cursor = next;
    }
  } else {
    for (let i = startIndex - 1; i >= 0; i -= 1) {
      const prev = ordered[i]!;
      const from = prev.halves[prev.halves.length - 1]!;
      const to = cursor.halves[0]!;
      if (hasWorkGap(snapshot, origin.rowId, occupancy, from, to, cursor.chantierId)) {
        break;
      }
      chain.push(prev);
      cursor = prev;
    }
    chain.reverse();
  }
  return chain;
}

function landingHasConflict(
  snapshot: PlanningSnapshot,
  landings: { rowId: string; halves: OccupiedHalf[] }[],
  movingPhaseIds: Set<string>,
): boolean {
  const occupancyByRow = new Map<
    string,
    ReturnType<typeof occupancyForRow>["cells"]
  >();
  for (const landing of landings) {
    let cells = occupancyByRow.get(landing.rowId);
    if (!cells) {
      cells = occupancyForRow(snapshot, landing.rowId).cells;
      occupancyByRow.set(landing.rowId, cells);
    }
    for (const slot of landing.halves) {
      if (isSlotBlockedForRow(snapshot, landing.rowId, slot.date, slot.half)) {
        return true;
      }
      for (const occupant of cells) {
        if (
          occupant.half.date === slot.date &&
          occupant.half.half === slot.half &&
          !movingPhaseIds.has(occupant.phaseId)
        ) {
          return true;
        }
      }
    }
  }
  return false;
}

function previewCellsForHalves(
  rowId: string,
  halves: OccupiedHalf[],
): DragShiftPreviewCell[] {
  return halves.map((item) => ({
    rowId,
    date: item.date,
    half: item.half,
  }));
}

function heureForHalf(half: Half, previous: string | null | undefined): string {
  const raw = previous?.trim().slice(0, 5) ?? "";
  const hour = Number(raw.slice(0, 2));
  if (half === 0) {
    if (raw && Number.isFinite(hour) && hour < 12) return raw;
    return "07:30";
  }
  if (raw && Number.isFinite(hour) && hour >= 12) return raw;
  return "13:00";
}

function patchesForBlock(
  snapshot: PlanningSnapshot,
  block: ChantierBlock,
  delta: number,
  employeId?: string | null,
): PhasePatch[] {
  const patches: PhasePatch[] = [];
  for (const phaseId of block.phaseIds) {
    const phase = snapshot.phases.find((item) => item.id === phaseId);
    if (!phase) continue;
    const nextEmploye = employeId !== undefined ? employeId : phase.employe_id;
    const employeeChanged = nextEmploye !== phase.employe_id;
    if (delta === 0 && !employeeChanged) continue;
    const slots = slotsFromExistingPhase(snapshot, phase).filter(
      (slot) => slot.rowId === block.rowId,
    );
    if (slots.length === 0) {
      if (!phase.date_debut) continue;
      const actualStart: Half =
        Number((phase.heure_debut ?? "07:30").slice(0, 2)) >= 12 ? 1 : 0;
      const first = addHalfSteps(phase.date_debut.slice(0, 10), actualStart, delta);
      const last = addHalfSteps(
        (phase.date_fin ?? phase.date_debut).slice(0, 10),
        actualStart,
        delta,
      );
      patches.push({
        id: phase.id,
        date_debut: first.date,
        date_fin: last.date,
        employe_id: nextEmploye,
        heure_debut: heureForHalf(first.half, phase.heure_debut),
      });
      continue;
    }
    slots.sort((left, right) =>
      compareHalves(
        { date: left.date, half: left.half },
        { date: right.date, half: right.half },
      ),
    );
    const first = addHalfSteps(slots[0]!.date, slots[0]!.half, delta);
    const last = addHalfSteps(
      slots[slots.length - 1]!.date,
      slots[slots.length - 1]!.half,
      delta,
    );
    patches.push({
      id: phase.id,
      date_debut: first.date,
      date_fin: last.date,
      employe_id: nextEmploye,
      heure_debut: heureForHalf(first.half, phase.heure_debut),
    });
  }
  return patches;
}

function halvesOverlap(left: OccupiedHalf[], right: OccupiedHalf[]): boolean {
  const keys = new Set(left.map((item) => `${item.date}|${item.half}`));
  return right.some((item) => keys.has(`${item.date}|${item.half}`));
}

function destCascadeChain(
  snapshot: PlanningSnapshot,
  destRowId: string,
  landing: ChantierBlock,
  direction: 1 | -1,
): { destBlocks: ChantierBlock[]; chain: ChantierBlock[] } {
  const destBlocks = chantierBlocksForRow(snapshot, destRowId);
  const { occupancy } = occupancyForRow(snapshot, destRowId);
  const overlapping = destBlocks.filter((block) =>
    halvesOverlap(block.halves, landing.halves),
  );
  const neighbors = gluedNeighbors(
    snapshot,
    occupancy,
    [landing, ...destBlocks],
    landing,
    direction,
  );
  const byKey = new Map<string, ChantierBlock>();
  for (const block of [...overlapping, ...neighbors]) {
    if (block.key === landing.key) continue;
    byKey.set(block.key, block);
  }
  return { destBlocks, chain: Array.from(byKey.values()) };
}

export type DragShiftResult = {
  delta: number;
  patches: PhasePatch[];
  chain: ChantierBlock[];
  preview: DragShiftPreviewCell[];
  blocked: boolean;
};

function emptyDragShift(preview: DragShiftPreviewCell[] = []): DragShiftResult {
  return { delta: 0, patches: [], chain: [], preview, blocked: false };
}

export function shiftChantierBlock(input: {
  snapshot: PlanningSnapshot;
  rowId: string;
  chantierId: string;
  grab: OccupiedHalf;
  drop: OccupiedHalf;
}): DragShiftResult {
  const delta =
    halfIndex(input.drop.date, input.drop.half) -
    halfIndex(input.grab.date, input.grab.half);
  if (delta === 0) return emptyDragShift();
  const blocks = chantierBlocksForRow(input.snapshot, input.rowId);
  const origin = blockContaining(blocks, input.chantierId, input.grab.date, input.grab.half);
  if (!origin) return emptyDragShift();
  const { occupancy } = occupancyForRow(input.snapshot, input.rowId);
  const direction: 1 | -1 = delta > 0 ? 1 : -1;
  const neighbors = gluedNeighbors(
    input.snapshot,
    occupancy,
    blocks,
    origin,
    direction,
  );
  const chain = direction > 0 ? [origin, ...neighbors] : [...neighbors, origin];
  const preview: DragShiftPreviewCell[] = [];
  const landings: { rowId: string; halves: OccupiedHalf[] }[] = [];
  const movingPhaseIds = new Set(chain.flatMap((block) => block.phaseIds));
  for (const block of chain) {
    const halves = previewHalves(block, delta);
    landings.push({ rowId: block.rowId, halves });
    preview.push(...previewCellsForHalves(block.rowId, halves));
  }
  if (landingHasConflict(input.snapshot, landings, movingPhaseIds)) {
    return { delta, patches: [], chain, preview, blocked: true };
  }
  const byId = new Map<string, PhasePatch>();
  for (const block of chain) {
    for (const patch of patchesForBlock(input.snapshot, block, delta)) {
      byId.set(patch.id, patch);
    }
  }
  return {
    delta,
    patches: Array.from(byId.values()),
    chain,
    preview,
    blocked: false,
  };
}

export function shiftOrMoveChantierBlock(input: {
  snapshot: PlanningSnapshot;
  fromRowId: string;
  toRowId: string;
  chantierId: string;
  grab: OccupiedHalf;
  drop: OccupiedHalf;
}): DragShiftResult {
  if (input.toRowId === input.fromRowId) {
    return shiftChantierBlock({
      snapshot: input.snapshot,
      rowId: input.fromRowId,
      chantierId: input.chantierId,
      grab: input.grab,
      drop: input.drop,
    });
  }
  const sourceBlocks = chantierBlocksForRow(input.snapshot, input.fromRowId);
  const origin = blockContaining(
    sourceBlocks,
    input.chantierId,
    input.grab.date,
    input.grab.half,
  );
  const delta =
    halfIndex(input.drop.date, input.drop.half) -
    halfIndex(input.grab.date, input.grab.half);
  const intendedPreview = origin
    ? previewCellsForHalves(input.toRowId, previewHalves(origin, delta))
    : previewCellsForHalves(input.toRowId, [input.drop]);
  if (isVirtualPlanningRow(input.toRowId) || isVirtualPlanningRow(input.fromRowId)) {
    return { ...emptyDragShift(intendedPreview), blocked: true };
  }
  const destEmployee = input.snapshot.employees.find(
    (employee) => employee.id === input.toRowId && employee.actif,
  );
  if (!destEmployee || !origin) {
    return { ...emptyDragShift(intendedPreview), blocked: true };
  }
  const landing: ChantierBlock = {
    ...origin,
    key: `landing|${origin.key}`,
    rowId: input.toRowId,
    halves: previewHalves(origin, delta),
  };
  let destChain: ChantierBlock[] = [];
  if (delta !== 0) {
    const direction: 1 | -1 = delta > 0 ? 1 : -1;
    destChain = destCascadeChain(
      input.snapshot,
      input.toRowId,
      landing,
      direction,
    ).chain;
  } else {
    destChain = chantierBlocksForRow(input.snapshot, input.toRowId).filter(
      (block) => halvesOverlap(block.halves, landing.halves),
    );
  }
  const preview: DragShiftPreviewCell[] = [
    ...previewCellsForHalves(input.toRowId, landing.halves),
  ];
  const landings: { rowId: string; halves: OccupiedHalf[] }[] = [
    { rowId: input.toRowId, halves: landing.halves },
  ];
  const movingPhaseIds = new Set([
    ...origin.phaseIds,
    ...destChain.flatMap((block) => block.phaseIds),
  ]);
  const destCanCascade = delta !== 0;
  if (!destCanCascade && destChain.length > 0) {
    return {
      delta,
      patches: [],
      chain: [{ ...origin, rowId: input.toRowId }, ...destChain],
      preview,
      blocked: true,
    };
  }
  for (const block of destChain) {
    const halves = previewHalves(block, delta);
    landings.push({ rowId: block.rowId, halves });
    preview.push(...previewCellsForHalves(block.rowId, halves));
  }
  if (landingHasConflict(input.snapshot, landings, movingPhaseIds)) {
    return {
      delta,
      patches: [],
      chain: [{ ...origin, rowId: input.toRowId }, ...destChain],
      preview,
      blocked: true,
    };
  }
  const byId = new Map<string, PhasePatch>();
  for (const patch of patchesForBlock(
    input.snapshot,
    origin,
    delta,
    input.toRowId,
  )) {
    byId.set(patch.id, patch);
  }
  if (delta !== 0) {
    for (const block of destChain) {
      for (const patch of patchesForBlock(input.snapshot, block, delta)) {
        if (!byId.has(patch.id)) byId.set(patch.id, patch);
      }
    }
  }
  return {
    delta,
    patches: Array.from(byId.values()),
    chain: [{ ...origin, rowId: input.toRowId }, ...destChain],
    preview,
    blocked: false,
  };
}

export function previewHalves(block: ChantierBlock, delta: number): OccupiedHalf[] {
  return block.halves.map((item) => addHalfSteps(item.date, item.half, delta));
}

function runDragShiftSelfCheck() {
  const moved = addHalfSteps("2026-09-10", 0, 1);
  if (moved.date !== "2026-09-10" || moved.half !== 1) {
    throw new Error("drag-shift: +1 demi-journée doit passer au même jour après-midi");
  }
  const nextDay = addHalfSteps("2026-09-10", 1, 1);
  if (nextDay.date !== "2026-09-11" || nextDay.half !== 0) {
    throw new Error("drag-shift: après-midi +1 doit aller au matin suivant");
  }
  const back = addHalfSteps("2026-09-11", 0, -2);
  if (back.date !== "2026-09-10" || back.half !== 0) {
    throw new Error("drag-shift: -2 demi-journées doit revenir au matin d’avant");
  }
  const movedAcross = shiftOrMoveChantierBlock({
    snapshot: {
      employees: [
        {
          id: "emp-a",
          nom: "A",
          roles: ["fabrication"],
          actif: true,
        },
        {
          id: "emp-b",
          nom: "B",
          roles: ["fabrication"],
          actif: true,
        },
      ],
      chantiers: [
        {
          id: "ch-a",
          nom_client: "Alpha",
          adresse: "",
          lien_dossier_onedrive: null,
          priorite: "normal",
          date_creation: "2026-09-01",
        },
        {
          id: "ch-b",
          nom_client: "Beta",
          adresse: "",
          lien_dossier_onedrive: null,
          priorite: "normal",
          date_creation: "2026-09-01",
        },
      ],
      elements: [
        { id: "el-a", chantier_id: "ch-a", nom_element: "A" },
        { id: "el-b", chantier_id: "ch-b", nom_element: "B" },
      ],
      phases: [
        {
          id: "ph-a",
          element_id: "el-a",
          type_phase: "fabrication",
          duree_estimee_heures: 4,
          date_debut: "2026-09-07",
          date_fin: "2026-09-07",
          heure_debut: "07:30",
          employe_id: "emp-a",
          statut: "a_faire",
          urgent: false,
        },
        {
          id: "ph-b",
          element_id: "el-b",
          type_phase: "fabrication",
          duree_estimee_heures: 4,
          date_debut: "2026-09-08",
          date_fin: "2026-09-08",
          heure_debut: "07:30",
          employe_id: "emp-b",
          statut: "a_faire",
          urgent: false,
        },
      ],
      absences: [],
      signalements: [],
      receptions: [],
      demandes: [],
      horaires: [],
    },
    fromRowId: "emp-a",
    toRowId: "emp-b",
    chantierId: "ch-a",
    grab: { date: "2026-09-07", half: 0 },
    drop: { date: "2026-09-08", half: 0 },
  });
  const originPatch = movedAcross.patches.find((item) => item.id === "ph-a");
  const destPatch = movedAcross.patches.find((item) => item.id === "ph-b");
  if (!originPatch || originPatch.employe_id !== "emp-b") {
    throw new Error("drag-shift: le bloc glissé doit changer de salarié");
  }
  if (originPatch.date_debut !== "2026-09-08") {
    throw new Error("drag-shift: le bloc glissé doit suivre la date de dépôt");
  }
  if (!destPatch || destPatch.date_debut !== "2026-09-09") {
    throw new Error(
      "drag-shift: le bloc collé sur la ligne d’arrivée doit être décalé",
    );
  }
  if (movedAcross.blocked) {
    throw new Error("drag-shift: un dépôt cascadable ne doit pas être refusé");
  }

  const ontoAbsence = shiftOrMoveChantierBlock({
    snapshot: {
      ...movedAcrossSnapshot(),
      absences: [
        {
          id: "abs-ecole",
          employe_id: "emp-b",
          date_debut: "2026-09-08",
          date_fin: "2026-09-08",
          type: "autre",
          motif_precision: "École",
        },
      ],
      phases: [movedAcrossSnapshot().phases[0]!],
    },
    fromRowId: "emp-a",
    toRowId: "emp-b",
    chantierId: "ch-a",
    grab: { date: "2026-09-07", half: 0 },
    drop: { date: "2026-09-08", half: 0 },
  });
  if (!ontoAbsence.blocked || ontoAbsence.patches.length !== 0) {
    throw new Error(
      "drag-shift: un dépôt sur une absence doit être refusé sans modifier les phases",
    );
  }

  const sameSlot = shiftOrMoveChantierBlock({
    snapshot: {
      ...movedAcrossSnapshot(),
      phases: [
        {
          ...movedAcrossSnapshot().phases[0]!,
          date_debut: "2026-09-08",
          date_fin: "2026-09-08",
        },
        movedAcrossSnapshot().phases[1]!,
      ],
    },
    fromRowId: "emp-a",
    toRowId: "emp-b",
    chantierId: "ch-a",
    grab: { date: "2026-09-08", half: 0 },
    drop: { date: "2026-09-08", half: 0 },
  });
  if (!sameSlot.blocked || sameSlot.patches.length !== 0) {
    throw new Error(
      "drag-shift: un dépôt sur un chantier déjà présent (sans cascade) doit être refusé",
    );
  }

  const sameRowBlocked = shiftChantierBlock({
    snapshot: {
      ...movedAcrossSnapshot(),
      phases: [
        movedAcrossSnapshot().phases[0]!,
        {
          ...movedAcrossSnapshot().phases[1]!,
          employe_id: "emp-a",
          date_debut: "2026-09-09",
          date_fin: "2026-09-09",
        },
      ],
    },
    rowId: "emp-a",
    chantierId: "ch-a",
    grab: { date: "2026-09-07", half: 0 },
    drop: { date: "2026-09-09", half: 0 },
  });
  if (!sameRowBlocked.blocked || sameRowBlocked.patches.length !== 0) {
    throw new Error(
      "drag-shift: un glisser horizontal sur un autre chantier non collé doit être refusé",
    );
  }

  const fridayMorning = shiftChantierBlock({
    snapshot: {
      ...movedAcrossSnapshot(),
      phases: [
        {
          ...movedAcrossSnapshot().phases[0]!,
          date_debut: "2026-10-16",
          date_fin: "2026-10-16",
          heure_debut: "08:00",
        },
      ],
    },
    rowId: "emp-a",
    chantierId: "ch-a",
    grab: { date: "2026-10-16", half: 0 },
    drop: { date: "2026-10-16", half: 1 },
  });
  if (!fridayMorning.blocked || fridayMorning.patches.length !== 0) {
    throw new Error(
      "drag-shift: un dépôt le vendredi après-midi (0 h en 35 h) doit être refusé",
    );
  }

  const ontoSaturday = shiftChantierBlock({
    snapshot: {
      ...movedAcrossSnapshot(),
      phases: [
        {
          ...movedAcrossSnapshot().phases[0]!,
          date_debut: "2026-10-16",
          date_fin: "2026-10-16",
          heure_debut: "08:00",
        },
      ],
    },
    rowId: "emp-a",
    chantierId: "ch-a",
    grab: { date: "2026-10-16", half: 0 },
    drop: { date: "2026-10-17", half: 0 },
  });
  if (!ontoSaturday.blocked || ontoSaturday.patches.length !== 0) {
    throw new Error("drag-shift: un dépôt le samedi (0 h) doit être refusé");
  }

  const ontoSunday = shiftChantierBlock({
    snapshot: {
      ...movedAcrossSnapshot(),
      phases: [
        {
          ...movedAcrossSnapshot().phases[0]!,
          date_debut: "2026-10-16",
          date_fin: "2026-10-16",
          heure_debut: "08:00",
        },
      ],
    },
    rowId: "emp-a",
    chantierId: "ch-a",
    grab: { date: "2026-10-16", half: 0 },
    drop: { date: "2026-10-18", half: 0 },
  });
  if (!ontoSunday.blocked || ontoSunday.patches.length !== 0) {
    throw new Error("drag-shift: un dépôt le dimanche doit être refusé");
  }

  const thursdayToFridayMorning = shiftChantierBlock({
    snapshot: {
      ...movedAcrossSnapshot(),
      phases: [
        {
          ...movedAcrossSnapshot().phases[0]!,
          date_debut: "2026-10-15",
          date_fin: "2026-10-15",
          heure_debut: "13:00",
        },
      ],
    },
    rowId: "emp-a",
    chantierId: "ch-a",
    grab: { date: "2026-10-15", half: 1 },
    drop: { date: "2026-10-16", half: 0 },
  });
  if (
    thursdayToFridayMorning.blocked ||
    thursdayToFridayMorning.patches[0]?.date_debut !== "2026-10-16" ||
    thursdayToFridayMorning.patches[0]?.heure_debut !== "07:30"
  ) {
    throw new Error(
      "drag-shift: un dépôt le vendredi matin (heures disponibles) doit rester possible",
    );
  }

  const glued: PlanningSnapshot["phases"] = [];
  const gluedChantiers: PlanningSnapshot["chantiers"] = [];
  const gluedElements: PlanningSnapshot["elements"] = [];
  const packedHalves: { date: string; half: 0 | 1; heure: string }[] = [
    { date: "2026-10-12", half: 0, heure: "08:00" },
    { date: "2026-10-12", half: 1, heure: "13:00" },
    { date: "2026-10-13", half: 0, heure: "08:00" },
    { date: "2026-10-13", half: 1, heure: "13:00" },
    { date: "2026-10-14", half: 0, heure: "08:00" },
    { date: "2026-10-14", half: 1, heure: "13:00" },
    { date: "2026-10-15", half: 0, heure: "08:00" },
    { date: "2026-10-15", half: 1, heure: "13:00" },
    { date: "2026-10-16", half: 0, heure: "08:00" },
  ];
  for (let i = 0; i < packedHalves.length; i += 1) {
    const id = `ch-g${i}`;
    const slot = packedHalves[i]!;
    gluedChantiers.push({
      id,
      nom_client: `G${i}`,
      adresse: "",
      lien_dossier_onedrive: null,
      priorite: "normal",
      date_creation: "2026-10-01",
    });
    gluedElements.push({
      id: `el-g${i}`,
      chantier_id: id,
      nom_element: `G${i}`,
    });
    glued.push({
      id: `ph-g${i}`,
      element_id: `el-g${i}`,
      type_phase: "fabrication",
      duree_estimee_heures: 4,
      date_debut: slot.date,
      date_fin: slot.date,
      heure_debut: slot.heure,
      employe_id: "emp-a",
      statut: "a_faire",
      urgent: false,
    });
  }
  const scale = shiftChantierBlock({
    snapshot: {
      ...movedAcrossSnapshot(),
      chantiers: gluedChantiers,
      elements: gluedElements,
      phases: glued,
    },
    rowId: "emp-a",
    chantierId: "ch-g0",
    grab: { date: "2026-10-12", half: 0 },
    drop: { date: "2026-10-12", half: 1 },
  });
  if (!scale.blocked || scale.patches.length !== 0) {
    throw new Error(
      "drag-shift: une file collée jusqu’au vendredi matin ne doit pas déborder sur le vendredi après-midi (0 h)",
    );
  }
  const scaleOk = shiftChantierBlock({
    snapshot: {
      ...movedAcrossSnapshot(),
      chantiers: gluedChantiers.slice(0, 8),
      elements: gluedElements.slice(0, 8),
      phases: glued.slice(0, 8),
    },
    rowId: "emp-a",
    chantierId: "ch-g0",
    grab: { date: "2026-10-12", half: 0 },
    drop: { date: "2026-10-12", half: 1 },
  });
  if (scaleOk.blocked || scaleOk.patches.length !== 8) {
    throw new Error(
      "drag-shift: une file collée lun–jeu doit pouvoir avancer d’une demi-journée",
    );
  }
}

function movedAcrossSnapshot(): PlanningSnapshot {
  return {
    employees: [
      {
        id: "emp-a",
        nom: "A",
        roles: ["fabrication"],
        actif: true,
      },
      {
        id: "emp-b",
        nom: "B",
        roles: ["fabrication"],
        actif: true,
      },
    ],
    chantiers: [
      {
        id: "ch-a",
        nom_client: "Alpha",
        adresse: "",
        lien_dossier_onedrive: null,
        priorite: "normal",
        date_creation: "2026-09-01",
      },
      {
        id: "ch-b",
        nom_client: "Beta",
        adresse: "",
        lien_dossier_onedrive: null,
        priorite: "normal",
        date_creation: "2026-09-01",
      },
    ],
    elements: [
      { id: "el-a", chantier_id: "ch-a", nom_element: "A" },
      { id: "el-b", chantier_id: "ch-b", nom_element: "B" },
    ],
    phases: [
      {
        id: "ph-a",
        element_id: "el-a",
        type_phase: "fabrication",
        duree_estimee_heures: 4,
        date_debut: "2026-09-07",
        date_fin: "2026-09-07",
        heure_debut: "07:30",
        employe_id: "emp-a",
        statut: "a_faire",
        urgent: false,
      },
      {
        id: "ph-b",
        element_id: "el-b",
        type_phase: "fabrication",
        duree_estimee_heures: 4,
        date_debut: "2026-09-08",
        date_fin: "2026-09-08",
        heure_debut: "07:30",
        employe_id: "emp-b",
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
}

runDragShiftSelfCheck();
