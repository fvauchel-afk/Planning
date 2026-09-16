import { addDays, isSunday, toISODate } from "@/lib/dates";
import {
  LOGISTIQUE_ROW_ID,
  isVirtualPlanningRow,
  type PlanningSnapshot,
  type TypePhase,
} from "@/lib/types";
import {
  employeeWorksOnDate,
  formatClock,
  hoursForSlot,
  minutesFromTime,
  timeFromMinutes,
  workWindowsForRow,
  type WorkWindow,
} from "./hours";

export const HOURS_PER_SLOT = 4;
export const MIN_LOGISTICS_WORKING_DAYS = 10;
export const MAX_LOGISTICS_WORKING_DAYS = 12;
export const TARGET_LOAD = 0.8;
/** Au-delà : vraie surcharge (la zone 80–110 % reste tolérée). */
export const LOAD_OVERFLOW = 1.1;
export const SEARCH_DAYS = 420;
export const SHORT_TASK_HOURS = 3;

export type Half = 0 | 1;

export type OccupiedSlot = {
  rowId: string;
  date: string;
  half: Half;
  startMin?: number;
  endMin?: number;
};

export type OccupiedSpan = {
  rowId: string;
  date: string;
  start: number;
  end: number;
  ownerId: string;
};

export function isShortTask(hours: number): boolean {
  return hours > 0 && hours < SHORT_TASK_HOURS;
}

export function halfLabel(half: Half): "matin" | "apres_midi" {
  return half === 0 ? "matin" : "apres_midi";
}

export function halfFromLabel(label: "matin" | "apres_midi"): Half {
  return label === "matin" ? 0 : 1;
}

export function slotKey(rowId: string, date: string, half: Half): string {
  return `${rowId}|${date}|${half}`;
}

function spanKey(rowId: string, date: string, start: number, end: number): string {
  return `span:${rowId}|${date}|${start}|${end}`;
}

export function occupancySpans(occupancy: Map<string, string>): OccupiedSpan[] {
  const spans: OccupiedSpan[] = [];
  for (const [key, ownerId] of Array.from(occupancy.entries())) {
    if (!key.startsWith("span:")) continue;
    const [rowId, date, startRaw, endRaw] = key.slice(5).split("|");
    spans.push({
      rowId,
      date,
      start: Number(startRaw),
      end: Number(endRaw),
      ownerId,
    });
  }
  return spans;
}

function occupancyBusyIndex(
  occupancy: Map<string, string>,
): Map<string, OccupiedSpan[]> | null {
  if (occupancy.size === 0) return null;
  const index = new Map<string, OccupiedSpan[]>();
  for (const span of occupancySpans(occupancy)) {
    const key = `${span.rowId}|${span.date}`;
    const list = index.get(key);
    if (list) list.push(span);
    else index.set(key, [span]);
  }
  return index;
}

export function compareSlots(a: OccupiedSlot, b: OccupiedSlot): number {
  if (a.date !== b.date) return a.date < b.date ? -1 : 1;
  const aMin = a.startMin ?? (a.half === 0 ? 0 : 12 * 60);
  const bMin = b.startMin ?? (b.half === 0 ? 0 : 12 * 60);
  if (aMin !== bMin) return aMin - bMin;
  return a.half - b.half;
}

export function hoursToSlots(hours: number): number {
  if (hours <= 0) return 0;
  return Math.ceil(hours / HOURS_PER_SLOT);
}

export function rowIdForPhase(
  type: TypePhase,
  employeId: string | null,
): string | null {
  if (type === "logistique") return LOGISTIQUE_ROW_ID;
  return employeId;
}

export function isCompanyHoliday(snapshot: PlanningSnapshot, date: string): boolean {
  return snapshot.absences.some(
    (absence) =>
      absence.type === "ferie_entreprise" &&
      date >= absence.date_debut &&
      date <= absence.date_fin,
  );
}

export function isEmployeeAbsent(
  snapshot: PlanningSnapshot,
  employeeId: string,
  date: string,
): boolean {
  return snapshot.absences.some(
    (absence) =>
      absence.employe_id === employeeId &&
      date >= absence.date_debut &&
      date <= absence.date_fin,
  );
}

export function isSlotBlockedForRow(
  snapshot: PlanningSnapshot,
  rowId: string,
  date: string,
  half?: Half,
): boolean {
  if (isSunday(date) || isCompanyHoliday(snapshot, date)) return true;
  if (isVirtualPlanningRow(rowId)) {
    return half !== undefined && hoursForSlot(snapshot, rowId, date, half) <= 0;
  }
  if (isEmployeeAbsent(snapshot, rowId, date)) return true;
  const employee = snapshot.employees.find((item) => item.id === rowId);
  if (!employeeWorksOnDate(snapshot, employee, date)) {
    return true;
  }
  if (half === undefined) return false;
  return hoursForSlot(snapshot, rowId, date, half) <= 0;
}

export function nextOpenSlot(
  snapshot: PlanningSnapshot,
  rowId: string,
  date: string,
  half: Half,
): OccupiedSlot {
  let cursorDate = date;
  let cursorHalf = half;
  for (let i = 0; i < SEARCH_DAYS * 2; i += 1) {
    if (!isSlotBlockedForRow(snapshot, rowId, cursorDate, cursorHalf)) {
      return { rowId, date: cursorDate, half: cursorHalf };
    }
    if (cursorHalf === 0) {
      cursorHalf = 1;
    } else {
      cursorHalf = 0;
      cursorDate = addDays(cursorDate, 1);
    }
  }
  return { rowId, date: cursorDate, half: cursorHalf };
}

export function advanceSlot(date: string, half: Half): { date: string; half: Half } {
  if (half === 0) return { date, half: 1 };
  return { date: addDays(date, 1), half: 0 };
}

export function subtractRanges(
  window: { start: number; end: number },
  busy: { start: number; end: number }[],
): { start: number; end: number }[] {
  let free = [{ start: window.start, end: window.end }];
  const ordered = [...busy].sort((a, b) => a.start - b.start);
  for (const block of ordered) {
    const next: { start: number; end: number }[] = [];
    for (const range of free) {
      if (block.end <= range.start || block.start >= range.end) {
        next.push(range);
        continue;
      }
      if (block.start > range.start) {
        next.push({ start: range.start, end: Math.min(block.start, range.end) });
      }
      if (block.end < range.end) {
        next.push({ start: Math.max(block.end, range.start), end: range.end });
      }
    }
    free = next.filter((range) => range.end - range.start >= 1);
  }
  return free;
}

export function freeRangesOnDate(
  occupancy: Map<string, string>,
  snapshot: PlanningSnapshot,
  rowId: string,
  date: string,
  afterMin = 0,
): { start: number; end: number; half: Half }[] {
  const windows = workWindowsForRow(snapshot, rowId, date);
  const busy = occupancySpans(occupancy).filter(
    (span) => span.rowId === rowId && span.date === date,
  );
  const out: { start: number; end: number; half: Half }[] = [];
  for (const window of windows) {
    for (const range of subtractRanges(window, busy)) {
      const start = Math.max(range.start, afterMin);
      if (range.end - start < 1) continue;
      out.push({ start, end: range.end, half: window.half });
    }
  }
  return out;
}

export function allocateHoursFrom(
  occupancy: Map<string, string>,
  snapshot: PlanningSnapshot,
  rowId: string,
  hours: number,
  fromDate: string,
  fromHalf: Half,
  options?: {
    short?: boolean;
    fromMin?: number;
    untilDate?: string | null;
    allowPartial?: boolean;
  },
): OccupiedSlot[] | null {
  if (hours <= 0) return [];
  const short = options?.short ?? isShortTask(hours);
  const untilDate = options?.untilDate?.slice(0, 10) || null;
  let remaining = Math.round(hours * 60);
  const slots: OccupiedSlot[] = [];
  const firstWindows = workWindowsForRow(snapshot, rowId, fromDate);
  const firstWindow =
    firstWindows.find((window) => window.half === fromHalf) ?? firstWindows[0];
  let cursorMin = options?.fromMin ?? firstWindow?.start ?? 0;
  let date = fromDate;
  let guard = 0;
  const busyIndex = occupancyBusyIndex(occupancy);
  while (remaining > 0 && guard < SEARCH_DAYS * 2) {
    guard += 1;
    if (untilDate && date > untilDate) break;
    const windows = workWindowsForRow(snapshot, rowId, date);
    const after = date === fromDate ? cursorMin : 0;
    const busy = busyIndex?.get(`${rowId}|${date}`) ?? [];
    for (const window of windows) {
      if (remaining <= 0) break;
      const frees = subtractRanges(window, busy);
      for (const range of frees) {
        const start = Math.max(range.start, after);
        if (range.end - start < 1) continue;
        if (!short && start > window.start + 1) continue;
        const take = Math.min(remaining, range.end - start);
        if (take < 1) continue;
        slots.push({
          rowId,
          date,
          half: window.half,
          startMin: start,
          endMin: start + take,
        });
        remaining -= take;
        if (remaining <= 0) break;
      }
    }
    date = addDays(date, 1);
    cursorMin = 0;
  }
  if (slots.length === 0) return null;
  if (remaining > 0 && !options?.allowPartial) return null;
  return slots;
}

export function spansFromExistingPhase(
  snapshot: PlanningSnapshot,
  phase: {
    type_phase: TypePhase;
    employe_id: string | null;
    date_debut: string | null;
    date_fin: string | null;
    duree_estimee_heures: number;
    heure_debut?: string | null;
  },
): OccupiedSpan[] {
  if (!phase.date_debut) return [];
  const rowId = rowIdForPhase(phase.type_phase, phase.employe_id);
  if (!rowId) return [];
  const startDate = phase.date_debut.slice(0, 10);
  const untilDate = phase.date_fin ? phase.date_fin.slice(0, 10) : startDate;
  const hours = Math.max(0, phase.duree_estimee_heures);
  const windows = workWindowsForRow(snapshot, rowId, startDate);
  let fromMin = windows[0]?.start ?? 0;
  const parsedStart = minutesFromHeureDebut(phase.heure_debut);
  if (parsedStart != null) fromMin = parsedStart;
  const half = windows.find((window) => fromMin < window.end)?.half ??
    (fromMin >= 12 * 60 ? 1 : 0);
  if (hours > 0) {
    const slots = allocateHoursFrom(
      new Map(),
      snapshot,
      rowId,
      hours,
      startDate,
      half,
      { short: true, fromMin, untilDate, allowPartial: true },
    );
    if (slots && slots.length > 0) {
      return slots.map((slot) => ({
        rowId,
        date: slot.date,
        start: slot.startMin ?? 0,
        end: slot.endMin ?? 0,
        ownerId: "",
      }));
    }
  }
  return fallbackSpansForDatedPhase(snapshot, rowId, startDate, untilDate, half);
}

function fallbackSpansForDatedPhase(
  snapshot: PlanningSnapshot,
  rowId: string,
  startDate: string,
  untilDate: string,
  half: Half,
): OccupiedSpan[] {
  const spans: OccupiedSpan[] = [];
  let date = startDate;
  while (date <= untilDate) {
    if (!isSunday(date)) {
      const windows = workWindowsForRow(snapshot, rowId, date);
      const window =
        windows.find((item) => item.half === half) ?? windows[0] ?? null;
      if (window) {
        spans.push({
          rowId,
          date,
          start: window.start,
          end: window.end,
          ownerId: "",
        });
      } else {
        const start = half === 1 ? 13 * 60 : 8 * 60;
        const end = half === 1 ? 17 * 60 : 12 * 60;
        spans.push({ rowId, date, start, end, ownerId: "" });
      }
    }
    date = addDays(date, 1);
  }
  return spans;
}

function minutesFromHeureDebut(value: unknown): number | null {
  if (value == null || value === "") return null;
  const text = String(value).trim();
  if (!text) return null;
  return minutesFromTime(text.slice(0, 5));
}

export function workingHalvesFrom(
  snapshot: PlanningSnapshot,
  rowId: string,
  startDate: string,
  startHalf: Half,
  hours: number,
): OccupiedSlot[] {
  return (
    allocateHoursFrom(new Map(), snapshot, rowId, hours, startDate, startHalf, {
      short: true,
    }) ?? []
  );
}

export function lastOccupiedSlotForRow(
  occupancy: Map<string, string>,
  snapshot: PlanningSnapshot,
  rowId: string,
): OccupiedSlot | null {
  const spans = occupancySpans(occupancy).filter((span) => span.rowId === rowId);
  let last: OccupiedSpan | null = null;
  for (const span of spans) {
    if (
      !last ||
      span.date > last.date ||
      (span.date === last.date && span.end > last.end)
    ) {
      last = span;
    }
  }
  if (!last) return null;
  const leftover = freeRangesOnDate(
    occupancy,
    snapshot,
    rowId,
    last.date,
    last.end,
  )[0];
  if (leftover) {
    return {
      rowId,
      date: last.date,
      half: leftover.half,
      startMin: leftover.start,
    };
  }
  const nextDate = addDays(last.date, 1);
  return nextOpenSlot(snapshot, rowId, nextDate, 0);
}

export function todayIso(): string {
  return toISODate(new Date());
}

const existingSlotsCache = new WeakMap<
  PlanningSnapshot,
  Map<string, OccupiedSlot[]>
>();

function existingPhaseKey(phase: {
  type_phase: TypePhase;
  employe_id: string | null;
  date_debut: string | null;
  date_fin: string | null;
  duree_estimee_heures: number;
  heure_debut?: string | null;
}): string {
  return [
    phase.type_phase,
    phase.employe_id ?? "",
    phase.date_debut ?? "",
    phase.date_fin ?? "",
    String(phase.duree_estimee_heures ?? 0),
    phase.heure_debut ?? "",
  ].join("\0");
}

export function slotsFromExistingPhase(
  snapshot: PlanningSnapshot,
  phase: {
    type_phase: TypePhase;
    employe_id: string | null;
    date_debut: string | null;
    date_fin: string | null;
    duree_estimee_heures: number;
    heure_debut?: string | null;
  },
): OccupiedSlot[] {
  let cache = existingSlotsCache.get(snapshot);
  if (!cache) {
    cache = new Map();
    existingSlotsCache.set(snapshot, cache);
  }
  const key = existingPhaseKey(phase);
  const hit = cache.get(key);
  if (hit) return hit;
  const slots = spansFromExistingPhase(snapshot, phase).map((span) => {
    const windows = workWindowsForRow(snapshot, span.rowId, span.date);
    const window =
      windows.find((item) => span.start < item.end && span.end > item.start) ??
      windows[0];
    return {
      rowId: span.rowId,
      date: span.date,
      half: window?.half ?? 0,
      startMin: span.start,
      endMin: span.end,
    };
  });
  cache.set(key, slots);
  return slots;
}

export function buildOccupancy(
  snapshot: PlanningSnapshot,
  ignorePhaseIds: Set<string> = new Set(),
): Map<string, string> {
  const occupancy = new Map<string, string>();
  for (const phase of snapshot.phases) {
    if (ignorePhaseIds.has(phase.id)) continue;
    const element = snapshot.elements.find((item) => item.id === phase.element_id);
    const chantierId = element?.chantier_id ?? phase.id;
    occupySlots(occupancy, slotsFromExistingPhase(snapshot, phase), chantierId);
  }
  return occupancy;
}

export function occupySlots(
  occupancy: Map<string, string>,
  slots: OccupiedSlot[],
  ownerId: string,
) {
  for (const slot of slots) {
    occupancy.set(slotKey(slot.rowId, slot.date, slot.half), ownerId);
    const start =
      slot.startMin ?? (slot.half === 0 ? 8 * 60 : 13 * 60);
    const end = slot.endMin ?? (slot.half === 0 ? 12 * 60 : 17 * 60);
    if (end > start) {
      occupancy.set(spanKey(slot.rowId, slot.date, start, end), ownerId);
    }
  }
}

export function slotHours(slot: OccupiedSlot): number {
  if (slot.startMin != null && slot.endMin != null) {
    return Math.round(((slot.endMin - slot.startMin) / 60) * 100) / 100;
  }
  return 0;
}

export { formatClock, timeFromMinutes };
export type { WorkWindow };
