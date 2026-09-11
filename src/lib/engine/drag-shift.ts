import { addDays, parseISODate } from "@/lib/dates";
import { hoursForSlot } from "@/lib/engine/hours";
import {
  isEmployeeAbsent,
  slotsFromExistingPhase,
  type Half,
} from "@/lib/engine/slots";
import { LOGISTIQUE_ROW_ID, type PhasePatch, type PlanningSnapshot } from "@/lib/types";

export type OccupiedHalf = { date: string; half: Half };

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
  if (rowId !== LOGISTIQUE_ROW_ID && isEmployeeAbsent(snapshot, rowId, date)) {
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

function clampDelta(
  blocks: ChantierBlock[],
  chain: ChantierBlock[],
  delta: number,
): number {
  if (delta === 0) return 0;
  const direction: 1 | -1 = delta > 0 ? 1 : -1;
  const edge =
    direction > 0
      ? chain[chain.length - 1]!.halves[chain[chain.length - 1]!.halves.length - 1]!
      : chain[0]!.halves[0]!;
  const chainKeys = new Set(chain.map((item) => item.key));
  const others = blocks.filter((item) => !chainKeys.has(item.key));
  const obstacle =
    direction > 0
      ? others
          .filter((item) => compareHalves(item.halves[0]!, edge) > 0)
          .sort((left, right) => compareHalves(left.halves[0]!, right.halves[0]!))[0]
      : others
          .filter(
            (item) =>
              compareHalves(item.halves[item.halves.length - 1]!, edge) < 0,
          )
          .sort((left, right) =>
            compareHalves(right.halves[right.halves.length - 1]!, left.halves[left.halves.length - 1]!),
          )[0];
  if (!obstacle) return delta;
  const obstacleEdge =
    direction > 0
      ? obstacle.halves[0]!
      : obstacle.halves[obstacle.halves.length - 1]!;
  const room =
    direction > 0
      ? halfIndex(obstacleEdge.date, obstacleEdge.half) -
        halfIndex(edge.date, edge.half) -
        1
      : halfIndex(edge.date, edge.half) -
        halfIndex(obstacleEdge.date, obstacleEdge.half) -
        1;
  if (direction > 0) return Math.max(0, Math.min(delta, room));
  return Math.min(0, Math.max(delta, -room));
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
): PhasePatch[] {
  if (delta === 0) return [];
  const patches: PhasePatch[] = [];
  for (const phaseId of block.phaseIds) {
    const phase = snapshot.phases.find((item) => item.id === phaseId);
    if (!phase) continue;
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
        employe_id: phase.employe_id,
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
      employe_id: phase.employe_id,
      heure_debut: heureForHalf(first.half, phase.heure_debut),
    });
  }
  return patches;
}

export function shiftChantierBlock(input: {
  snapshot: PlanningSnapshot;
  rowId: string;
  chantierId: string;
  grab: OccupiedHalf;
  drop: OccupiedHalf;
}): { delta: number; patches: PhasePatch[]; chain: ChantierBlock[] } {
  const delta =
    halfIndex(input.drop.date, input.drop.half) -
    halfIndex(input.grab.date, input.grab.half);
  if (delta === 0) return { delta: 0, patches: [], chain: [] };
  const blocks = chantierBlocksForRow(input.snapshot, input.rowId);
  const origin = blockContaining(blocks, input.chantierId, input.grab.date, input.grab.half);
  if (!origin) return { delta: 0, patches: [], chain: [] };
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
  const applied = clampDelta(blocks, chain, delta);
  if (applied === 0) return { delta: 0, patches: [], chain };
  const byId = new Map<string, PhasePatch>();
  for (const block of chain) {
    for (const patch of patchesForBlock(input.snapshot, block, applied)) {
      byId.set(patch.id, patch);
    }
  }
  return { delta: applied, patches: Array.from(byId.values()), chain };
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
}

runDragShiftSelfCheck();
