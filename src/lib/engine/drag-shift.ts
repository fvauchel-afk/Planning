import { addDays, parseISODate } from "@/lib/dates";
import { hoursForSlot, timeFromMinutes } from "@/lib/engine/hours";
import {
  occupantsConflictWithSlots,
  rebuiltSlotsForStart,
} from "@/lib/engine/hour-grid";
import {
  isEmployeeAbsent,
  isSlotBlockedForRow,
  slotsFromExistingPhase,
  type Half,
} from "@/lib/engine/slots";
import {
  isVirtualPlanningRow,
  type PhaseInsert,
  type PhasePatch,
  type PhasePlanning,
  type PlanningSnapshot,
} from "@/lib/types";

export type OccupiedHalf = { date: string; half: Half; startMin?: number };

export type DragShiftPreviewCell = {
  rowId: string;
  date: string;
  half: Half;
  startMin?: number;
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
): {
  occupancy: Map<string, string>;
  cells: { half: OccupiedHalf; chantierId: string; phaseId: string }[];
} {
  const occupancy = new Map<string, string>();
  const cells: { half: OccupiedHalf; chantierId: string; phaseId: string }[] =
    [];
  for (const phase of snapshot.phases) {
    const element = snapshot.elements.find(
      (item) => item.id === phase.element_id,
    );
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
        block.halves.some((item) => item.date === date && item.half === half),
    ) ?? null
  );
}

export function blockForPhaseOnRow(
  snapshot: PlanningSnapshot,
  rowId: string,
  phaseId: string,
): ChantierBlock | null {
  const { cells } = occupancyForRow(snapshot, rowId);
  const ofPhase = cells.filter((cell) => cell.phaseId === phaseId);
  if (ofPhase.length === 0) return null;
  const halves: OccupiedHalf[] = [];
  const seen = new Set<string>();
  for (const cell of ofPhase) {
    const key = `${cell.half.date}|${cell.half.half}`;
    if (seen.has(key)) continue;
    seen.add(key);
    halves.push(cell.half);
  }
  const start = halves[0]!;
  return {
    key: `${rowId}|phase|${phaseId}|${start.date}|${start.half}`,
    rowId,
    chantierId: ofPhase[0]!.chantierId,
    halves,
    phaseIds: [phaseId],
  };
}

function packWorkHalvesAfter(
  snapshot: PlanningSnapshot,
  rowId: string,
  after: OccupiedHalf,
  count: number,
): OccupiedHalf[] | null {
  const packed: OccupiedHalf[] = [];
  let cursor = after;
  for (let i = 0; i < count; i += 1) {
    const next = nextOpenWorkHalf(snapshot, rowId, cursor);
    if (!next) return null;
    packed.push(next);
    cursor = next;
  }
  return packed;
}

function lastOverlappingDestHalf(
  snapshot: PlanningSnapshot,
  rowId: string,
  landing: OccupiedHalf[],
  ignoreChantierId: string,
): OccupiedHalf | null {
  const blocks = chantierBlocksForRow(snapshot, rowId).filter(
    (block) =>
      block.chantierId !== ignoreChantierId &&
      halvesOverlap(block.halves, landing),
  );
  if (blocks.length === 0) return null;
  let last: OccupiedHalf | null = null;
  for (const block of blocks) {
    const end = block.halves[block.halves.length - 1]!;
    if (!last || compareHalves(end, last) > 0) last = end;
  }
  return last;
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
      if (
        hasWorkGap(snapshot, origin.rowId, occupancy, from, to, next.chantierId)
      ) {
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
      if (
        hasWorkGap(
          snapshot,
          origin.rowId,
          occupancy,
          from,
          to,
          cursor.chantierId,
        )
      ) {
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
      const first = addHalfSteps(
        phase.date_debut.slice(0, 10),
        actualStart,
        delta,
      );
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
  inserts?: PhaseInsert[];
  chain: ChantierBlock[];
  preview: DragShiftPreviewCell[];
  blocked: boolean;
};

function emptyDragShift(preview: DragShiftPreviewCell[] = []): DragShiftResult {
  return { delta: 0, patches: [], inserts: [], chain: [], preview, blocked: false };
}

function halfKey(item: OccupiedHalf): string {
  return `${item.date}|${item.half}`;
}

function nextOpenWorkHalf(
  snapshot: PlanningSnapshot,
  rowId: string,
  from: OccupiedHalf,
): OccupiedHalf | null {
  let cursor = addHalfSteps(from.date, from.half, 1);
  for (let i = 0; i < 90; i += 1) {
    if (
      isWorkHalf(snapshot, rowId, cursor.date, cursor.half) &&
      !isSlotBlockedForRow(snapshot, rowId, cursor.date, cursor.half)
    ) {
      return cursor;
    }
    cursor = addHalfSteps(cursor.date, cursor.half, 1);
  }
  return null;
}

function hoursForOccupiedHalf(
  snapshot: PlanningSnapshot,
  rowId: string,
  half: OccupiedHalf,
): number {
  return Math.max(0, hoursForSlot(snapshot, rowId, half.date, half.half));
}

function insertFromPhase(
  phase: PhasePlanning,
  start: OccupiedHalf,
  end: OccupiedHalf,
  hours: number,
  employeId: string,
): PhaseInsert {
  return {
    element_id: phase.element_id,
    type_phase: phase.type_phase,
    duree_estimee_heures: hours,
    date_debut: start.date,
    date_fin: end.date,
    heure_debut: heureForHalf(start.half, phase.heure_debut),
    employe_id: employeId,
    statut: phase.statut,
    urgent: phase.urgent,
    heures_supplementaires_par_jour:
      phase.heures_supplementaires_par_jour ?? 0,
    dates_estimatives: phase.dates_estimatives,
  };
}

function tryInsertChantierInMiddle(input: {
  snapshot: PlanningSnapshot;
  fromRowId: string;
  toRowId: string;
  origin: ChantierBlock;
  delta: number;
}): DragShiftResult | null {
  const landingHalves = previewHalves(input.origin, input.delta);
  if (landingHalves.length === 0) return null;
  const landingStart = landingHalves[0]!;
  const landingEnd = landingHalves[landingHalves.length - 1]!;
  const destBlocks = chantierBlocksForRow(
    input.snapshot,
    input.toRowId,
  ).filter(
    (block) =>
      block.chantierId !== input.origin.chantierId &&
      halvesOverlap(block.halves, landingHalves),
  );
  const splitTargets = destBlocks.filter((block) =>
    block.halves.some((half) => compareHalves(half, landingStart) < 0),
  );
  if (splitTargets.length === 0) return null;

  const { occupancy } = occupancyForRow(input.snapshot, input.toRowId);
  const rowBlocks = chantierBlocksForRow(input.snapshot, input.toRowId);
  const following: ChantierBlock[] = [];
  const seenFollow = new Set<string>();
  for (const target of splitTargets) {
    for (const neighbor of gluedNeighbors(
      input.snapshot,
      occupancy,
      rowBlocks,
      target,
      1,
    )) {
      if (neighbor.chantierId === input.origin.chantierId) continue;
      if (seenFollow.has(neighbor.key)) continue;
      seenFollow.add(neighbor.key);
      following.push(neighbor);
    }
  }

  const suffixQueue: OccupiedHalf[] = [];
  const seenSuffix = new Set<string>();
  const pushSuffix = (half: OccupiedHalf) => {
    const key = halfKey(half);
    if (seenSuffix.has(key)) return;
    seenSuffix.add(key);
    suffixQueue.push(half);
  };
  const orderedTargets = [...splitTargets].sort((left, right) =>
    compareHalves(left.halves[0]!, right.halves[0]!),
  );
  for (const target of orderedTargets) {
    for (const half of target.halves) {
      if (compareHalves(half, landingStart) >= 0) pushSuffix(half);
    }
  }
  for (const block of following) {
    for (const half of block.halves) pushSuffix(half);
  }
  if (suffixQueue.length === 0) return null;

  const packed: OccupiedHalf[] = [];
  let cursor = landingEnd;
  for (let i = 0; i < suffixQueue.length; i += 1) {
    const next = nextOpenWorkHalf(input.snapshot, input.toRowId, cursor);
    if (!next) return null;
    packed.push(next);
    cursor = next;
  }
  const remap = new Map<string, OccupiedHalf>();
  suffixQueue.forEach((old, index) => {
    remap.set(halfKey(old), packed[index]!);
  });

  const movingPhaseIds = new Set([
    ...input.origin.phaseIds,
    ...orderedTargets.flatMap((block) => block.phaseIds),
    ...following.flatMap((block) => block.phaseIds),
  ]);
  const landings: { rowId: string; halves: OccupiedHalf[] }[] = [
    { rowId: input.toRowId, halves: landingHalves },
    { rowId: input.toRowId, halves: packed },
  ];
  if (landingHasConflict(input.snapshot, landings, movingPhaseIds)) {
    return null;
  }

  const byId = new Map<string, PhasePatch>();
  const inserts: PhaseInsert[] = [];
  for (const patch of patchesForBlock(
    input.snapshot,
    { ...input.origin, rowId: input.toRowId },
    input.delta,
    input.toRowId,
  )) {
    byId.set(patch.id, patch);
  }

  const remapHalves = (halves: OccupiedHalf[]): OccupiedHalf[] =>
    halves.map((half) => remap.get(halfKey(half)) ?? half);

  const applyRemapToPhase = (
    phase: PhasePlanning,
    halves: OccupiedHalf[],
  ): PhasePatch | null => {
    const mapped = remapHalves(halves).sort(compareHalves);
    if (mapped.length === 0) return null;
    const first = mapped[0]!;
    const last = mapped[mapped.length - 1]!;
    const hours = halves.reduce(
      (sum, half) =>
        sum + hoursForOccupiedHalf(input.snapshot, input.toRowId, half),
      0,
    );
    return {
      id: phase.id,
      date_debut: first.date,
      date_fin: last.date,
      employe_id: input.toRowId,
      heure_debut: heureForHalf(first.half, phase.heure_debut),
      duree_estimee_heures: hours,
    };
  };

  const phaseHalvesOnRow = (phaseId: string): OccupiedHalf[] => {
    const phase = input.snapshot.phases.find((item) => item.id === phaseId);
    if (!phase) return [];
    const slots = slotsFromExistingPhase(input.snapshot, phase).filter(
      (slot) => slot.rowId === input.toRowId || slot.rowId === input.fromRowId,
    );
    const unique = new Map<string, OccupiedHalf>();
    for (const slot of slots) {
      const half: OccupiedHalf = { date: slot.date, half: slot.half };
      unique.set(halfKey(half), half);
    }
    return Array.from(unique.values()).sort(compareHalves);
  };

  for (const phaseId of orderedTargets.flatMap((block) => block.phaseIds)) {
    const phase = input.snapshot.phases.find((item) => item.id === phaseId);
    if (!phase) continue;
    const halves = phaseHalvesOnRow(phaseId);
    const prefix = halves.filter(
      (half) => compareHalves(half, landingStart) < 0,
    );
    const suffix = halves.filter(
      (half) => compareHalves(half, landingStart) >= 0,
    );
    if (suffix.length === 0) continue;
    if (prefix.length === 0) {
      const patch = applyRemapToPhase(phase, suffix);
      if (patch) byId.set(patch.id, patch);
      continue;
    }
    const prefixHours = prefix.reduce(
      (sum, half) =>
        sum + hoursForOccupiedHalf(input.snapshot, input.toRowId, half),
      0,
    );
    const suffixHours = suffix.reduce(
      (sum, half) =>
        sum + hoursForOccupiedHalf(input.snapshot, input.toRowId, half),
      0,
    );
    const prefixLast = prefix[prefix.length - 1]!;
    byId.set(phase.id, {
      id: phase.id,
      date_debut: prefix[0]!.date,
      date_fin: prefixLast.date,
      employe_id: phase.employe_id,
      heure_debut: heureForHalf(prefix[0]!.half, phase.heure_debut),
      duree_estimee_heures: prefixHours,
    });
    const mappedSuffix = remapHalves(suffix).sort(compareHalves);
    const suffixFirst = mappedSuffix[0];
    const suffixLast = mappedSuffix[mappedSuffix.length - 1];
    if (suffixFirst && suffixLast && suffixHours > 0) {
      inserts.push(
        insertFromPhase(
          phase,
          suffixFirst,
          suffixLast,
          suffixHours,
          input.toRowId,
        ),
      );
    }
  }

  for (const block of following) {
    for (const phaseId of block.phaseIds) {
      if (byId.has(phaseId)) continue;
      const phase = input.snapshot.phases.find((item) => item.id === phaseId);
      if (!phase) continue;
      const patch = applyRemapToPhase(phase, phaseHalvesOnRow(phaseId));
      if (patch) byId.set(patch.id, patch);
    }
  }

  const preview: DragShiftPreviewCell[] = [
    ...previewCellsForHalves(input.toRowId, landingHalves),
    ...previewCellsForHalves(input.toRowId, packed),
  ];
  return {
    delta: input.delta,
    patches: Array.from(byId.values()),
    inserts,
    chain: [
      { ...input.origin, rowId: input.toRowId },
      ...orderedTargets,
      ...following,
    ],
    preview,
    blocked: false,
  };
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
  const origin = blockContaining(
    blocks,
    input.chantierId,
    input.grab.date,
    input.grab.half,
  );
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
    const inserted = tryInsertChantierInMiddle({
      snapshot: input.snapshot,
      fromRowId: input.rowId,
      toRowId: input.rowId,
      origin,
      delta,
    });
    if (inserted) return inserted;
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
  if (
    isVirtualPlanningRow(input.toRowId) ||
    isVirtualPlanningRow(input.fromRowId)
  ) {
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
  const inserted = tryInsertChantierInMiddle({
    snapshot: input.snapshot,
    fromRowId: input.fromRowId,
    toRowId: input.toRowId,
    origin,
    delta,
  });
  if (inserted) return inserted;
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

export function shiftPhaseOrJump(input: {
  snapshot: PlanningSnapshot;
  fromRowId: string;
  toRowId: string;
  phaseId: string;
  grab: OccupiedHalf;
  drop: OccupiedHalf;
}): DragShiftResult {
  if (
    isVirtualPlanningRow(input.toRowId) ||
    isVirtualPlanningRow(input.fromRowId)
  ) {
    return { ...emptyDragShift(), blocked: true };
  }
  const origin = blockForPhaseOnRow(
    input.snapshot,
    input.fromRowId,
    input.phaseId,
  );
  if (!origin) return emptyDragShift();
  const destEmployee = input.snapshot.employees.find(
    (employee) => employee.id === input.toRowId && employee.actif,
  );
  if (!destEmployee) return { ...emptyDragShift(), blocked: true };
  const delta =
    halfIndex(input.drop.date, input.drop.half) -
    halfIndex(input.grab.date, input.grab.half);
  if (
    input.toRowId === input.fromRowId &&
    delta === 0
  ) {
    return emptyDragShift();
  }
  if (
    isSlotBlockedForRow(
      input.snapshot,
      input.toRowId,
      input.drop.date,
      input.drop.half,
    ) &&
    !lastOverlappingDestHalf(
      input.snapshot,
      input.toRowId,
      [input.drop],
      origin.chantierId,
    )
  ) {
    return {
      ...emptyDragShift(
        previewCellsForHalves(input.toRowId, [input.drop]),
      ),
      blocked: true,
    };
  }
  let landingHalves = previewHalves(origin, delta);
  if (landingHalves.length === 0) {
    landingHalves = [{ date: input.drop.date, half: input.drop.half }];
  }
  const movingPhaseIds = new Set([input.phaseId]);
  const offHours = landingHalves.some((half) =>
    isSlotBlockedForRow(input.snapshot, input.toRowId, half.date, half.half),
  );
  let jumped = false;
  if (
    offHours ||
    landingHasConflict(
      input.snapshot,
      [{ rowId: input.toRowId, halves: landingHalves }],
      movingPhaseIds,
    )
  ) {
    let guard = 0;
    let cursorAfter: OccupiedHalf | null = lastOverlappingDestHalf(
      input.snapshot,
      input.toRowId,
      landingHalves,
      origin.chantierId,
    );
    if (!cursorAfter) {
      cursorAfter = landingHalves[landingHalves.length - 1] ?? input.drop;
    }
    while (guard < 16) {
      guard += 1;
      const packed = packWorkHalvesAfter(
        input.snapshot,
        input.toRowId,
        cursorAfter,
        origin.halves.length,
      );
      if (!packed) {
        return {
          delta,
          patches: [],
          chain: [{ ...origin, rowId: input.toRowId }],
          preview: previewCellsForHalves(input.toRowId, landingHalves),
          blocked: true,
        };
      }
      if (
        !landingHasConflict(
          input.snapshot,
          [{ rowId: input.toRowId, halves: packed }],
          movingPhaseIds,
        )
      ) {
        landingHalves = packed;
        jumped = true;
        break;
      }
      const nextDest = lastOverlappingDestHalf(
        input.snapshot,
        input.toRowId,
        packed,
        origin.chantierId,
      );
      if (!nextDest) {
        return {
          delta,
          patches: [],
          chain: [{ ...origin, rowId: input.toRowId }],
          preview: previewCellsForHalves(input.toRowId, packed),
          blocked: true,
        };
      }
      cursorAfter = nextDest;
    }
    if (!jumped) {
      return {
        delta,
        patches: [],
        chain: [{ ...origin, rowId: input.toRowId }],
        preview: previewCellsForHalves(input.toRowId, landingHalves),
        blocked: true,
      };
    }
  }
  const first = landingHalves[0]!;
  const last = landingHalves[landingHalves.length - 1]!;
  const phase = input.snapshot.phases.find((item) => item.id === input.phaseId);
  if (!phase) return emptyDragShift();
  const hours = origin.halves.reduce(
    (sum, half) =>
      sum + hoursForOccupiedHalf(input.snapshot, input.fromRowId, half),
    0,
  );
  return {
    delta: jumped || delta !== 0 ? 1 : 0,
    patches: [
      {
        id: phase.id,
        date_debut: first.date,
        date_fin: last.date,
        employe_id: input.toRowId,
        heure_debut: heureForHalf(first.half, phase.heure_debut),
        duree_estimee_heures: hours || phase.duree_estimee_heures,
      },
    ],
    chain: [{ ...origin, rowId: input.toRowId, halves: landingHalves }],
    preview: previewCellsForHalves(input.toRowId, landingHalves),
    blocked: false,
  };
}

function packWorkHalvesFrom(
  snapshot: PlanningSnapshot,
  rowId: string,
  start: OccupiedHalf,
  count: number,
): OccupiedHalf[] | null {
  if (count <= 0) return [];
  const packed: OccupiedHalf[] = [];
  let cursor: OccupiedHalf;
  if (
    isWorkHalf(snapshot, rowId, start.date, start.half) &&
    !isSlotBlockedForRow(snapshot, rowId, start.date, start.half)
  ) {
    packed.push({ date: start.date, half: start.half });
    cursor = start;
  } else {
    const next = nextOpenWorkHalf(snapshot, rowId, start);
    if (!next) return null;
    packed.push(next);
    cursor = next;
  }
  while (packed.length < count) {
    const next = nextOpenWorkHalf(snapshot, rowId, cursor);
    if (!next) return null;
    packed.push(next);
    cursor = next;
  }
  return packed;
}

function landingConflictsKeepingHole(
  snapshot: PlanningSnapshot,
  toRowId: string,
  landing: OccupiedHalf[],
  phaseId: string,
  freed: OccupiedHalf[],
): boolean {
  const freedKeys = new Set(freed.map((item) => halfKey(item)));
  const cells = occupancyForRow(snapshot, toRowId).cells;
  for (const slot of landing) {
    if (isSlotBlockedForRow(snapshot, toRowId, slot.date, slot.half)) {
      return true;
    }
    for (const occupant of cells) {
      if (
        occupant.half.date !== slot.date ||
        occupant.half.half !== slot.half
      ) {
        continue;
      }
      if (
        occupant.phaseId === phaseId &&
        freedKeys.has(halfKey(occupant.half))
      ) {
        continue;
      }
      return true;
    }
  }
  return false;
}

export function shiftPhaseDay(input: {
  snapshot: PlanningSnapshot;
  fromRowId: string;
  toRowId: string;
  phaseId: string;
  grab: OccupiedHalf;
  drop: OccupiedHalf;
}): DragShiftResult {
  const previewDrop = previewCellsForHalves(input.toRowId, [input.drop]);
  if (
    isVirtualPlanningRow(input.toRowId) ||
    isVirtualPlanningRow(input.fromRowId)
  ) {
    return { ...emptyDragShift(previewDrop), blocked: true };
  }
  if (
    input.fromRowId === input.toRowId &&
    input.grab.date === input.drop.date
  ) {
    return emptyDragShift();
  }
  const destEmployee = input.snapshot.employees.find(
    (employee) => employee.id === input.toRowId && employee.actif,
  );
  if (!destEmployee) {
    return { ...emptyDragShift(previewDrop), blocked: true };
  }
  const origin = blockForPhaseOnRow(
    input.snapshot,
    input.fromRowId,
    input.phaseId,
  );
  if (!origin) return emptyDragShift();
  const extracted = origin.halves.filter((half) => half.date === input.grab.date);
  if (extracted.length === 0) return emptyDragShift();
  const prefix = origin.halves.filter(
    (half) => compareHalves(half, extracted[0]!) < 0,
  );
  const suffix = origin.halves.filter(
    (half) => compareHalves(half, extracted[extracted.length - 1]!) > 0,
  );

  let landing = packWorkHalvesFrom(
    input.snapshot,
    input.toRowId,
    input.drop,
    extracted.length,
  );
  if (!landing) {
    return { ...emptyDragShift(previewDrop), blocked: true };
  }
  const phase = input.snapshot.phases.find((item) => item.id === input.phaseId);
  if (!phase) return emptyDragShift();
  const originElement = input.snapshot.elements.find(
    (item) => item.id === phase.element_id,
  );
  const chantierId = originElement?.chantier_id ?? "";

  if (
    landingConflictsKeepingHole(
      input.snapshot,
      input.toRowId,
      landing,
      input.phaseId,
      extracted,
    )
  ) {
    let jumped = false;
    let cursorAfter: OccupiedHalf | null = lastOverlappingDestHalf(
      input.snapshot,
      input.toRowId,
      landing,
      chantierId,
    );
    if (!cursorAfter) {
      cursorAfter = landing[landing.length - 1] ?? input.drop;
    }
    for (let guard = 0; guard < 16; guard += 1) {
      const packed = packWorkHalvesAfter(
        input.snapshot,
        input.toRowId,
        cursorAfter,
        extracted.length,
      );
      if (!packed) break;
      if (
        !landingConflictsKeepingHole(
          input.snapshot,
          input.toRowId,
          packed,
          input.phaseId,
          extracted,
        )
      ) {
        landing = packed;
        jumped = true;
        break;
      }
      const nextDest = lastOverlappingDestHalf(
        input.snapshot,
        input.toRowId,
        packed,
        chantierId,
      );
      if (!nextDest) break;
      cursorAfter = nextDest;
    }
    if (!jumped) {
      return {
        delta: 1,
        patches: [],
        chain: [origin],
        preview: previewCellsForHalves(input.toRowId, landing),
        blocked: true,
      };
    }
  }

  const hoursOf = (halves: OccupiedHalf[], rowId: string) =>
    halves.reduce(
      (sum, half) =>
        sum + hoursForOccupiedHalf(input.snapshot, rowId, half),
      0,
    );
  const movedHours =
    hoursOf(extracted, input.fromRowId) ||
    hoursOf(landing, input.toRowId) ||
    4;
  const prefixHours = hoursOf(prefix, input.fromRowId);
  const suffixHours = hoursOf(suffix, input.fromRowId);

  const patchRange = (
    halves: OccupiedHalf[],
    hours: number,
    employeId: string,
  ): PhasePatch => {
    const first = halves[0]!;
    const last = halves[halves.length - 1]!;
    return {
      id: phase.id,
      date_debut: first.date,
      date_fin: last.date,
      employe_id: employeId,
      heure_debut: heureForHalf(first.half, phase.heure_debut),
      duree_estimee_heures: hours,
    };
  };

  const patches: PhasePatch[] = [];
  const inserts: PhaseInsert[] = [];
  const landingFirst = landing[0]!;
  const landingLast = landing[landing.length - 1]!;
  if (prefix.length === 0 && suffix.length === 0) {
    patches.push(patchRange(landing, movedHours, input.toRowId));
  } else if (prefix.length > 0) {
    patches.push(patchRange(prefix, prefixHours, input.fromRowId));
    inserts.push(
      insertFromPhase(
        phase,
        landingFirst,
        landingLast,
        movedHours,
        input.toRowId,
      ),
    );
    if (suffix.length > 0) {
      inserts.push(
        insertFromPhase(
          phase,
          suffix[0]!,
          suffix[suffix.length - 1]!,
          suffixHours,
          input.fromRowId,
        ),
      );
    }
  } else {
    patches.push(patchRange(suffix, suffixHours, input.fromRowId));
    inserts.push(
      insertFromPhase(
        phase,
        landingFirst,
        landingLast,
        movedHours,
        input.toRowId,
      ),
    );
  }

  return {
    delta: 1,
    patches,
    inserts,
    chain: [origin],
    preview: previewCellsForHalves(input.toRowId, landing),
    blocked: false,
  };
}

/** @deprecated alias — extraire un jour de phase */
export function shiftSingleHalf(
  input: Parameters<typeof shiftPhaseDay>[0],
): DragShiftResult {
  return shiftPhaseDay(input);
}

export function shiftChantierBlockByMinutes(input: {
  snapshot: PlanningSnapshot;
  fromRowId: string;
  toRowId: string;
  chantierId: string;
  grab: OccupiedHalf & { startMin: number };
  drop: OccupiedHalf & { startMin: number };
  phaseId?: string;
}): DragShiftResult {
  const previewSeed: DragShiftPreviewCell[] = [
    {
      rowId: input.toRowId,
      date: input.drop.date,
      half: input.drop.half,
      startMin: input.drop.startMin,
    },
  ];
  if (
    isVirtualPlanningRow(input.toRowId) ||
    isVirtualPlanningRow(input.fromRowId)
  ) {
    return { ...emptyDragShift(previewSeed), blocked: true };
  }
  if (
    isSlotBlockedForRow(
      input.snapshot,
      input.toRowId,
      input.drop.date,
      input.drop.half,
    )
  ) {
    return { ...emptyDragShift(previewSeed), blocked: true };
  }
  const blocks = chantierBlocksForRow(input.snapshot, input.fromRowId);
  const origin = input.phaseId
    ? blockForPhaseOnRow(input.snapshot, input.fromRowId, input.phaseId)
    : blockContaining(
        blocks,
        input.chantierId,
        input.grab.date,
        input.grab.half,
      );
  if (!origin) return emptyDragShift(previewSeed);
  const destEmployee = input.snapshot.employees.find(
    (employee) => employee.id === input.toRowId && employee.actif,
  );
  if (!destEmployee) {
    return { ...emptyDragShift(previewSeed), blocked: true };
  }
  const deltaMinutes = input.drop.startMin - input.grab.startMin;
  const sameSlot =
    input.toRowId === input.fromRowId &&
    input.drop.date === input.grab.date &&
    deltaMinutes === 0;
  if (sameSlot) return emptyDragShift(previewSeed);

  const movingPhaseIds = new Set(origin.phaseIds);
  const patches: PhasePatch[] = [];
  const preview: DragShiftPreviewCell[] = [];
  for (const phaseId of origin.phaseIds) {
    const phase = input.snapshot.phases.find((item) => item.id === phaseId);
    if (!phase) continue;
    const currentSlots = slotsFromExistingPhase(input.snapshot, phase).filter(
      (slot) => slot.rowId === input.fromRowId,
    );
    currentSlots.sort((left, right) => {
      if (left.date !== right.date) return left.date < right.date ? -1 : 1;
      return (left.startMin ?? 0) - (right.startMin ?? 0);
    });
    const first = currentSlots[0];
    if (!first || first.startMin == null) continue;
    const startDate = input.drop.date;
    const startMin =
      first.date === input.grab.date
        ? first.startMin + deltaMinutes
        : input.drop.startMin;
    const hours = Math.max(0, Number(phase.duree_estimee_heures) || 0);
    const rebuilt = rebuiltSlotsForStart(
      input.snapshot,
      input.toRowId,
      hours > 0 ? hours : 1,
      startDate,
      startMin,
    );
    if (!rebuilt || rebuilt.length === 0) {
      return {
        delta: 0,
        patches: [],
        chain: [origin],
        preview: previewSeed,
        blocked: true,
      };
    }
    if (occupantsConflictWithSlots(input.snapshot, rebuilt, movingPhaseIds)) {
      if (input.phaseId) {
        return shiftPhaseOrJump({
          snapshot: input.snapshot,
          fromRowId: input.fromRowId,
          toRowId: input.toRowId,
          phaseId: input.phaseId,
          grab: { date: input.grab.date, half: input.grab.half },
          drop: { date: input.drop.date, half: input.drop.half },
        });
      }
      return {
        delta: 0,
        patches: [],
        chain: [origin],
        preview: previewSeed,
        blocked: true,
      };
    }
    const last = rebuilt[rebuilt.length - 1]!;
    patches.push({
      id: phase.id,
      date_debut: rebuilt[0]!.date,
      date_fin: last.date,
      employe_id: input.toRowId,
      heure_debut: timeFromMinutes(rebuilt[0]!.startMin ?? startMin),
    });
    for (const slot of rebuilt) {
      preview.push({
        rowId: input.toRowId,
        date: slot.date,
        half: slot.half,
        startMin: slot.startMin,
      });
    }
  }
  if (patches.length === 0) {
    return { ...emptyDragShift(previewSeed), blocked: true };
  }
  return {
    delta: deltaMinutes === 0 ? 0 : 1,
    patches,
    chain: [{ ...origin, rowId: input.toRowId }],
    preview: preview.length > 0 ? preview : previewSeed,
    blocked: false,
  };
}

export function previewHalves(
  block: ChantierBlock,
  delta: number,
): OccupiedHalf[] {
  return block.halves.map((item) => addHalfSteps(item.date, item.half, delta));
}

function runDragShiftSelfCheck() {
  const moved = addHalfSteps("2026-09-10", 0, 1);
  if (moved.date !== "2026-09-10" || moved.half !== 1) {
    throw new Error(
      "drag-shift: +1 demi-journée doit passer au même jour après-midi",
    );
  }
  const nextDay = addHalfSteps("2026-09-10", 1, 1);
  if (nextDay.date !== "2026-09-11" || nextDay.half !== 0) {
    throw new Error("drag-shift: après-midi +1 doit aller au matin suivant");
  }
  const back = addHalfSteps("2026-09-11", 0, -2);
  if (back.date !== "2026-09-10" || back.half !== 0) {
    throw new Error(
      "drag-shift: -2 demi-journées doit revenir au matin d’avant",
    );
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

  const slackSnapshot: PlanningSnapshot = {
    ...movedAcrossSnapshot(),
    chantiers: [
      {
        id: "ch-early",
        nom_client: "Tôt",
        adresse: "",
        lien_dossier_onedrive: null,
        priorite: "normal",
        date_creation: "2026-09-01",
      },
      {
        id: "ch-next",
        nom_client: "Lendemain",
        adresse: "",
        lien_dossier_onedrive: null,
        priorite: "normal",
        date_creation: "2026-09-01",
      },
    ],
    elements: [
      { id: "el-early", chantier_id: "ch-early", nom_element: "A" },
      { id: "el-next", chantier_id: "ch-next", nom_element: "B" },
    ],
    phases: [
      {
        id: "ph-early",
        element_id: "el-early",
        type_phase: "fabrication",
        duree_estimee_heures: 6.5,
        date_debut: "2026-09-22",
        date_fin: "2026-09-22",
        heure_debut: "07:30",
        employe_id: "emp-a",
        statut: "a_faire",
        urgent: false,
      },
      {
        id: "ph-next",
        element_id: "el-next",
        type_phase: "fabrication",
        duree_estimee_heures: 4,
        date_debut: "2026-09-23",
        date_fin: "2026-09-23",
        heure_debut: "07:30",
        employe_id: "emp-a",
        statut: "a_faire",
        urgent: false,
      },
    ],
  };
  const slackMove = shiftChantierBlockByMinutes({
    snapshot: slackSnapshot,
    fromRowId: "emp-a",
    toRowId: "emp-a",
    chantierId: "ch-early",
    grab: { date: "2026-09-22", half: 0, startMin: 7 * 60 + 30 },
    drop: { date: "2026-09-22", half: 0, startMin: 8 * 60 },
  });
  if (slackMove.blocked) {
    throw new Error(
      "drag-shift: un glissement de 30 min dans un trou ne doit pas être bloqué",
    );
  }
  if (slackMove.patches.some((patch) => patch.id === "ph-next")) {
    throw new Error("drag-shift: slack — le lendemain ne doit pas bouger");
  }
  const nextPatch = slackMove.patches.find((patch) => patch.id === "ph-early");
  if (!nextPatch || nextPatch.heure_debut !== "08:00") {
    throw new Error(
      "drag-shift: Vue Jour doit cranter l’heure de début (08:00)",
    );
  }
  if (
    nextPatch.date_debut !== "2026-09-22" ||
    nextPatch.date_fin !== "2026-09-22"
  ) {
    throw new Error(
      "drag-shift: slack — les dates du chantier déplacé restent le même jour",
    );
  }

  const slackOneHour = shiftChantierBlockByMinutes({
    snapshot: slackSnapshot,
    fromRowId: "emp-a",
    toRowId: "emp-a",
    chantierId: "ch-early",
    grab: { date: "2026-09-22", half: 0, startMin: 7 * 60 + 30 },
    drop: { date: "2026-09-22", half: 0, startMin: 8 * 60 + 30 },
  });
  if (slackOneHour.blocked) {
    throw new Error(
      "drag-shift: un glissement de 1 h dans le trou de fin de journée ne doit pas être bloqué",
    );
  }
  if (slackOneHour.patches.some((patch) => patch.id === "ph-next")) {
    throw new Error(
      "drag-shift: slack 1 h — le lendemain ne doit pas être recalé",
    );
  }
  const earlyAfterHour = slackOneHour.patches.find(
    (patch) => patch.id === "ph-early",
  );
  if (
    !earlyAfterHour ||
    earlyAfterHour.heure_debut !== "08:30" ||
    earlyAfterHour.date_debut !== "2026-09-22" ||
    earlyAfterHour.date_fin !== "2026-09-22"
  ) {
    throw new Error(
      "drag-shift: slack 1 h — le bloc reste le mardi, début 08:30",
    );
  }

  const dupontLike: PlanningSnapshot = {
    ...slackSnapshot,
    chantiers: [
      ...slackSnapshot.chantiers,
      {
        id: "ch-dupont",
        nom_client: "Portail Dupont",
        adresse: "",
        lien_dossier_onedrive: null,
        priorite: "normal",
        date_creation: "2026-09-01",
      },
    ],
    elements: [
      ...slackSnapshot.elements,
      { id: "el-dupont", chantier_id: "ch-dupont", nom_element: "Portail" },
    ],
    phases: [
      {
        id: "ph-dupont",
        element_id: "el-dupont",
        type_phase: "fabrication",
        duree_estimee_heures: 8,
        date_debut: "2026-09-17",
        date_fin: "2026-09-18",
        heure_debut: "07:30",
        employe_id: "emp-a",
        statut: "a_faire",
        urgent: false,
      },
      {
        id: "ph-after",
        element_id: "el-next",
        type_phase: "fabrication",
        duree_estimee_heures: 4,
        date_debut: "2026-09-21",
        date_fin: "2026-09-21",
        heure_debut: "07:30",
        employe_id: "emp-a",
        statut: "a_faire",
        urgent: false,
      },
    ],
  };
  const dupontThirty = shiftChantierBlockByMinutes({
    snapshot: dupontLike,
    fromRowId: "emp-a",
    toRowId: "emp-a",
    chantierId: "ch-dupont",
    grab: { date: "2026-09-17", half: 0, startMin: 7 * 60 + 30 },
    drop: { date: "2026-09-17", half: 0, startMin: 8 * 60 },
  });
  if (dupontThirty.blocked) {
    throw new Error(
      "drag-shift: Dupont 8 h + 30 min (trou le 18 au matin) ne doit pas être bloqué",
    );
  }
  if (dupontThirty.patches.some((patch) => patch.id === "ph-after")) {
    throw new Error(
      "drag-shift: Dupont + 30 min — le chantier du lundi suivant ne doit pas bouger",
    );
  }
  const dupontPatch = dupontThirty.patches.find(
    (patch) => patch.id === "ph-dupont",
  );
  if (
    !dupontPatch ||
    dupontPatch.heure_debut !== "08:00" ||
    dupontPatch.date_debut !== "2026-09-17" ||
    dupontPatch.date_fin !== "2026-09-18"
  ) {
    throw new Error(
      "drag-shift: Dupont + 30 min — dates 17–18 conservées, début 08:00",
    );
  }

  const fridayAfternoon = shiftChantierBlockByMinutes({
    snapshot: {
      ...movedAcrossSnapshot(),
      phases: [
        {
          id: "ph-fri",
          element_id: "el-a",
          type_phase: "fabrication",
          duree_estimee_heures: 4,
          date_debut: "2026-09-18",
          date_fin: "2026-09-18",
          heure_debut: "07:30",
          employe_id: "emp-a",
          statut: "a_faire",
          urgent: false,
        },
      ],
    },
    fromRowId: "emp-a",
    toRowId: "emp-a",
    chantierId: "ch-a",
    grab: { date: "2026-09-18", half: 0, startMin: 7 * 60 + 30 },
    drop: { date: "2026-09-18", half: 1, startMin: 13 * 60 },
  });
  if (!fridayAfternoon.blocked) {
    throw new Error(
      "drag-shift: Vue Jour — dépôt vendredi après-midi (0 h) doit être refusé",
    );
  }

  const overlapSameMorning = shiftChantierBlockByMinutes({
    snapshot: slackSnapshot,
    fromRowId: "emp-a",
    toRowId: "emp-a",
    chantierId: "ch-next",
    grab: { date: "2026-09-23", half: 0, startMin: 7 * 60 + 30 },
    drop: { date: "2026-09-22", half: 0, startMin: 8 * 60 },
  });
  if (!overlapSameMorning.blocked) {
    throw new Error(
      "drag-shift: deux fabrications qui se chevauchent en minutes doivent être en conflit",
    );
  }

  const insertSnapshot: PlanningSnapshot = {
    ...movedAcrossSnapshot(),
    phases: [
      {
        ...movedAcrossSnapshot().phases[0]!,
        date_debut: "2026-09-11",
        date_fin: "2026-09-11",
        duree_estimee_heures: 4,
        employe_id: "emp-a",
      },
      {
        ...movedAcrossSnapshot().phases[1]!,
        date_debut: "2026-09-07",
        date_fin: "2026-09-09",
        duree_estimee_heures: 22.5,
        employe_id: "emp-a",
      },
    ],
  };
  const insertMiddle = shiftChantierBlock({
    snapshot: insertSnapshot,
    rowId: "emp-a",
    chantierId: "ch-a",
    grab: { date: "2026-09-11", half: 0 },
    drop: { date: "2026-09-08", half: 0 },
  });
  const originInserted = insertMiddle.patches.find((item) => item.id === "ph-a");
  const destPrefix = insertMiddle.patches.find((item) => item.id === "ph-b");
  if (insertMiddle.blocked || !originInserted || !destPrefix) {
    throw new Error(
      "drag-shift: déposer au milieu d’un autre chantier doit ouvrir le bloc, pas refuser",
    );
  }
  if (originInserted.date_debut !== "2026-09-08") {
    throw new Error(
      "drag-shift: le chantier glissé doit commencer sur la case de dépôt",
    );
  }
  if (destPrefix.date_debut !== "2026-09-07" || destPrefix.date_fin !== "2026-09-07") {
    throw new Error(
      "drag-shift: le début du chantier cible doit rester avant le dépôt",
    );
  }
  const destSuffix = insertMiddle.inserts?.find(
    (item) => item.element_id === "el-b",
  );
  if (!destSuffix || !destSuffix.date_debut || destSuffix.date_debut < "2026-09-08") {
    throw new Error(
      "drag-shift: la suite du chantier cible doit reprendre après le chantier inséré",
    );
  }

  const insertAcross = shiftOrMoveChantierBlock({
    snapshot: {
      ...insertSnapshot,
      phases: [
        {
          ...insertSnapshot.phases[0]!,
          employe_id: "emp-b",
          date_debut: "2026-09-11",
          date_fin: "2026-09-11",
        },
        insertSnapshot.phases[1]!,
      ],
    },
    fromRowId: "emp-b",
    toRowId: "emp-a",
    chantierId: "ch-a",
    grab: { date: "2026-09-11", half: 0 },
    drop: { date: "2026-09-08", half: 0 },
  });
  if (
    insertAcross.blocked ||
    insertAcross.patches.find((item) => item.id === "ph-a")?.employe_id !== "emp-a" ||
    insertAcross.patches.find((item) => item.id === "ph-b")?.date_fin !== "2026-09-07"
  ) {
    throw new Error(
      "drag-shift: insérer au milieu depuis une autre ligne doit garder le préfixe du chantier cible",
    );
  }

  const phaseJump = shiftPhaseOrJump({
    snapshot: insertSnapshot,
    fromRowId: "emp-a",
    toRowId: "emp-a",
    phaseId: "ph-a",
    grab: { date: "2026-09-11", half: 0 },
    drop: { date: "2026-09-08", half: 0 },
  });
  const jumped = phaseJump.patches.find((item) => item.id === "ph-a");
  const destUntouched = phaseJump.patches.some((item) => item.id === "ph-b");
  if (
    phaseJump.blocked ||
    !jumped ||
    destUntouched ||
    (jumped.date_debut ?? "") <= "2026-09-09"
  ) {
    throw new Error(
      "drag-shift: une phase seule doit sauter l’autre chantier, sans l’ouvrir au milieu",
    );
  }

  const phaseIntoHole = shiftPhaseOrJump({
    snapshot: insertSnapshot,
    fromRowId: "emp-a",
    toRowId: "emp-a",
    phaseId: "ph-a",
    grab: { date: "2026-09-11", half: 0 },
    drop: { date: "2026-09-10", half: 0 },
  });
  if (
    phaseIntoHole.blocked ||
    phaseIntoHole.patches.find((item) => item.id === "ph-a")?.date_debut !==
      "2026-09-10"
  ) {
    throw new Error(
      "drag-shift: une phase seule doit se caler dans un creux libre",
    );
  }

  const longPhaseSnapshot: PlanningSnapshot = {
    ...movedAcrossSnapshot(),
    chantiers: [
      {
        id: "ch-a",
        nom_client: "Alpha",
        adresse: "",
        lien_dossier_onedrive: null,
        priorite: "normal",
        date_creation: "2026-09-01",
      },
    ],
    elements: [{ id: "el-a", chantier_id: "ch-a", nom_element: "A" }],
    phases: [
      {
        id: "ph-a",
        element_id: "el-a",
        type_phase: "fabrication",
        duree_estimee_heures: 22.5,
        date_debut: "2026-09-07",
        date_fin: "2026-09-09",
        heure_debut: "07:30",
        employe_id: "emp-a",
        statut: "a_faire",
        urgent: false,
      },
    ],
  };
  const longHalves = blockForPhaseOnRow(
    longPhaseSnapshot,
    "emp-a",
    "ph-a",
  )?.halves;
  if (!longHalves || longHalves.length < 5) {
    throw new Error(
      "drag-shift: une phase de 3 jours doit occuper plusieurs créneaux",
    );
  }
  const middle = longHalves[2]!;
  const extracted = shiftPhaseDay({
    snapshot: longPhaseSnapshot,
    fromRowId: "emp-a",
    toRowId: "emp-a",
    phaseId: "ph-a",
    grab: middle,
    drop: { date: "2026-09-10", half: 0 },
  });
  const kept = extracted.patches.find((item) => item.id === "ph-a");
  const movedInsert = extracted.inserts?.find(
    (item) => item.date_debut === "2026-09-10",
  );
  const suffixInsert = extracted.inserts?.find(
    (item) => item.date_debut === "2026-09-09",
  );
  if (
    extracted.blocked ||
    kept?.date_debut !== "2026-09-07" ||
    kept?.date_fin !== "2026-09-07" ||
    !movedInsert ||
    !suffixInsert ||
    suffixInsert.date_fin !== "2026-09-09" ||
    extracted.inserts?.some((item) => item.date_debut === "2026-09-08")
  ) {
    throw new Error(
      "drag-shift: extraire un jour du milieu doit laisser un creux, sans recaler la suite",
    );
  }
  const occupiedDrop = shiftPhaseDay({
    snapshot: {
      ...longPhaseSnapshot,
      chantiers: [
        ...longPhaseSnapshot.chantiers,
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
        ...longPhaseSnapshot.elements,
        { id: "el-b", chantier_id: "ch-b", nom_element: "B" },
      ],
      phases: [
        ...longPhaseSnapshot.phases,
        {
          id: "ph-b",
          element_id: "el-b",
          type_phase: "fabrication",
          duree_estimee_heures: 4,
          date_debut: "2026-09-10",
          date_fin: "2026-09-10",
          heure_debut: "07:30",
          employe_id: "emp-a",
          statut: "a_faire",
          urgent: false,
        },
      ],
    },
    fromRowId: "emp-a",
    toRowId: "emp-a",
    phaseId: "ph-a",
    grab: middle,
    drop: { date: "2026-09-10", half: 0 },
  });
  const jumpedDay = occupiedDrop.inserts?.find(
    (item) => item.employe_id === "emp-a" && item.date_debut !== "2026-09-09",
  );
  const keptAfterJump = occupiedDrop.patches.find((item) => item.id === "ph-a");
  if (
    occupiedDrop.blocked ||
    keptAfterJump?.date_debut !== "2026-09-07" ||
    keptAfterJump?.date_fin !== "2026-09-07" ||
    !jumpedDay ||
    (jumpedDay.date_debut ?? "") < "2026-09-10"
  ) {
    throw new Error(
      "drag-shift: le jour extrait doit sauter l’autre chantier, le creux reste vide",
    );
  }

  const ontoOtherEmployee = shiftPhaseDay({
    snapshot: longPhaseSnapshot,
    fromRowId: "emp-a",
    toRowId: "emp-b",
    phaseId: "ph-a",
    grab: middle,
    drop: { date: "2026-09-10", half: 0 },
  });
  const keptOnOrigin = ontoOtherEmployee.patches.find(
    (item) => item.id === "ph-a",
  );
  const movedToOther = ontoOtherEmployee.inserts?.find(
    (item) => item.employe_id === "emp-b",
  );
  const suffixOnOrigin = ontoOtherEmployee.inserts?.find(
    (item) => item.employe_id === "emp-a",
  );
  if (
    ontoOtherEmployee.blocked ||
    keptOnOrigin?.employe_id !== "emp-a" ||
    keptOnOrigin?.date_debut !== "2026-09-07" ||
    keptOnOrigin?.date_fin !== "2026-09-07" ||
    !movedToOther ||
    movedToOther.date_debut !== "2026-09-10" ||
    movedToOther.date_fin !== "2026-09-10" ||
    !suffixOnOrigin ||
    suffixOnOrigin.date_debut !== "2026-09-09" ||
    suffixOnOrigin.date_fin !== "2026-09-09" ||
    ontoOtherEmployee.inserts?.some((item) => item.date_debut === "2026-09-08")
  ) {
    throw new Error(
      "drag-shift: extraire un jour vers un autre salarié libre doit laisser le creux et caler le jour à l’arrivée",
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
