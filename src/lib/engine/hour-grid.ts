import { addDays } from "@/lib/dates";
import {
  SEARCH_DAYS,
  allocateHoursFrom,
  isSlotBlockedForRow,
  minuteRangesOverlap,
  overlappingOwners,
  occupySlots,
  slotsFromExistingPhase,
  type Half,
  type OccupiedSlot,
} from "@/lib/engine/slots";
import {
  timeFromMinutes,
  workWindowsForRow,
  type WorkWindow,
} from "@/lib/engine/hours";
import type { PlanningSnapshot } from "@/lib/types";

/** Cran de saisie Vue Jour : ni 15 min (trop fin) ni l’heure pile (trop gros). */
export const TIME_SNAP_MINUTES = 30;

export function snapMinutes(minutes: number, snap = TIME_SNAP_MINUTES): number {
  if (!Number.isFinite(minutes)) return 0;
  return Math.round(minutes / snap) * snap;
}

export function halfForMinutes(windows: WorkWindow[], minutes: number): Half {
  const hit = windows.find(
    (window) => minutes < window.end && minutes >= window.start,
  );
  if (hit) return hit.half;
  const nearest = windows.reduce<WorkWindow | null>((best, window) => {
    if (!best) return window;
    const dist = Math.min(
      Math.abs(minutes - window.start),
      Math.abs(minutes - window.end),
    );
    const bestDist = Math.min(
      Math.abs(minutes - best.start),
      Math.abs(minutes - best.end),
    );
    return dist < bestDist ? window : best;
  }, null);
  return nearest?.half ?? (minutes >= 12 * 60 ? 1 : 0);
}

export function clampToWorkWindows(
  windows: WorkWindow[],
  minutes: number,
): { minutes: number; half: Half } | null {
  if (windows.length === 0) return null;
  const snapped = snapMinutes(minutes);
  for (const window of windows) {
    if (snapped >= window.start && snapped < window.end) {
      return { minutes: snapped, half: window.half };
    }
    if (snapped === window.end) {
      return {
        minutes: snapMinutes(window.end - TIME_SNAP_MINUTES),
        half: window.half,
      };
    }
  }
  let best: { minutes: number; half: Half; dist: number } | null = null;
  for (const window of windows) {
    const candidates = [window.start, window.end - TIME_SNAP_MINUTES].filter(
      (item) => item >= window.start && item < window.end,
    );
    for (const candidate of candidates) {
      const dist = Math.abs(snapped - candidate);
      if (!best || dist < best.dist) {
        best = { minutes: candidate, half: window.half, dist };
      }
    }
  }
  if (!best || best.dist > TIME_SNAP_MINUTES) return null;
  return { minutes: best.minutes, half: best.half };
}

export function addWorkMinutes(
  snapshot: PlanningSnapshot,
  rowId: string,
  date: string,
  startMin: number,
  deltaMin: number,
): { date: string; startMin: number; half: Half } | null {
  if (deltaMin === 0) {
    const windows = workWindowsForRow(snapshot, rowId, date);
    const clamped = clampToWorkWindows(windows, startMin);
    if (!clamped) return null;
    if (isSlotBlockedForRow(snapshot, rowId, date, clamped.half)) return null;
    return { date, startMin: clamped.minutes, half: clamped.half };
  }
  const direction = deltaMin > 0 ? 1 : -1;
  let remaining = Math.abs(Math.round(deltaMin));
  let cursorDate = date;
  let cursorMin = startMin;
  for (let i = 0; i < SEARCH_DAYS * 4 && remaining > 0; i += 1) {
    const windows = workWindowsForRow(snapshot, rowId, cursorDate);
    const ordered = direction > 0 ? windows : [...windows].reverse();
    for (const window of ordered) {
      if (remaining <= 0) break;
      if (isSlotBlockedForRow(snapshot, rowId, cursorDate, window.half))
        continue;
      if (direction > 0) {
        const from = Math.max(cursorMin, window.start);
        if (from >= window.end) continue;
        const take = Math.min(remaining, window.end - from);
        cursorMin = from + take;
        remaining -= take;
        if (remaining <= 0) {
          return { date: cursorDate, startMin: cursorMin, half: window.half };
        }
      } else {
        const from = Math.min(cursorMin, window.end);
        if (from <= window.start) continue;
        const take = Math.min(remaining, from - window.start);
        cursorMin = from - take;
        remaining -= take;
        if (remaining <= 0) {
          return { date: cursorDate, startMin: cursorMin, half: window.half };
        }
      }
    }
    cursorDate = addDays(cursorDate, direction);
    const nextWindows = workWindowsForRow(snapshot, rowId, cursorDate);
    if (nextWindows.length === 0) {
      cursorMin = direction > 0 ? 0 : 24 * 60;
      continue;
    }
    cursorMin =
      direction > 0
        ? nextWindows[0]!.start
        : nextWindows[nextWindows.length - 1]!.end;
  }
  return null;
}

export function rebuiltSlotsForStart(
  snapshot: PlanningSnapshot,
  rowId: string,
  hours: number,
  date: string,
  startMin: number,
): OccupiedSlot[] | null {
  const windows = workWindowsForRow(snapshot, rowId, date);
  const half = halfForMinutes(windows, startMin);
  return allocateHoursFrom(new Map(), snapshot, rowId, hours, date, half, {
    short: true,
    fromMin: startMin,
  });
}

export function occupantsConflictWithSlots(
  snapshot: PlanningSnapshot,
  slots: OccupiedSlot[],
  ignorePhaseIds: Set<string>,
): boolean {
  const occupancy = new Map<string, string>();
  for (const phase of snapshot.phases) {
    if (ignorePhaseIds.has(phase.id)) continue;
    const element = snapshot.elements.find(
      (item) => item.id === phase.element_id,
    );
    const chantierId = element?.chantier_id ?? phase.id;
    occupySlots(occupancy, slotsFromExistingPhase(snapshot, phase), chantierId);
  }
  return overlappingOwners(occupancy, slots).length > 0;
}

export function slotListsOverlap(
  left: OccupiedSlot[],
  right: OccupiedSlot[],
): boolean {
  for (const a of left) {
    if (a.startMin == null || a.endMin == null) continue;
    for (const b of right) {
      if (b.startMin == null || b.endMin == null) continue;
      if (a.rowId !== b.rowId) continue;
      if (
        minuteRangesOverlap(
          { date: a.date, start: a.startMin, end: a.endMin },
          { date: b.date, start: b.startMin, end: b.endMin },
        )
      ) {
        return true;
      }
    }
  }
  return false;
}

export { timeFromMinutes };

function runHourGridSelfCheck() {
  if (snapMinutes(8 * 60 + 14) !== 8 * 60) {
    throw new Error("hour-grid: 08:14 doit cranter à 08:00");
  }
  if (snapMinutes(8 * 60 + 15) !== 8 * 60 + 30) {
    throw new Error("hour-grid: 08:15 doit cranter à 08:30");
  }
  if (
    minuteRangesOverlap(
      { date: "2026-09-18", start: 8 * 60, end: 10 * 60 },
      { date: "2026-09-18", start: 10 * 60, end: 12 * 60 },
    )
  ) {
    throw new Error("hour-grid: 08–10 et 10–12 ne se chevauchent pas");
  }
  if (
    !minuteRangesOverlap(
      { date: "2026-09-18", start: 8 * 60, end: 12 * 60 },
      { date: "2026-09-18", start: 9 * 60, end: 11 * 60 },
    )
  ) {
    throw new Error("hour-grid: 08–12 et 09–11 se chevauchent");
  }
}

runHourGridSelfCheck();
