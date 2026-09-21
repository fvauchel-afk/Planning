import { addDays } from "@/lib/dates";

export type PlanHalf = 0 | 1;

export type PlanCellId = {
  rowId: string;
  date: string;
  half: PlanHalf;
};

export function planCellKey(cell: PlanCellId): string {
  return `${cell.rowId}|${cell.date}|${cell.half}`;
}

export function parsePlanCellKey(raw: string | null | undefined): PlanCellId | null {
  if (!raw) return null;
  const parts = raw.split("|");
  if (parts.length !== 3) return null;
  const [rowId, date, halfRaw] = parts;
  const half = Number(halfRaw);
  if (!rowId || !/^\d{4}-\d{2}-\d{2}$/.test(date ?? "") || (half !== 0 && half !== 1)) {
    return null;
  }
  return { rowId, date: date!, half: half as PlanHalf };
}

export function planCellFromNode(target: EventTarget | null): PlanCellId | null {
  const node =
    target instanceof Element ? target.closest("[data-plan-cell]") : null;
  return parsePlanCellKey(node?.getAttribute("data-plan-cell"));
}

export function planCellFromPoint(clientX: number, clientY: number): PlanCellId | null {
  if (typeof document === "undefined") return null;
  return planCellFromNode(document.elementFromPoint(clientX, clientY));
}

export function isSelectModifier(event: {
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
}): boolean {
  return event.ctrlKey || event.metaKey || event.shiftKey;
}

function halfGoesFirst(left: PlanCellId, right: PlanCellId): boolean {
  if (left.date !== right.date) return left.date < right.date;
  return left.half <= right.half;
}

function timeHalves(
  from: PlanCellId,
  to: PlanCellId,
): { date: string; half: PlanHalf }[] {
  const start = halfGoesFirst(from, to) ? from : to;
  const end = halfGoesFirst(from, to) ? to : from;
  const slots: { date: string; half: PlanHalf }[] = [];
  let date = start.date;
  let half: PlanHalf = start.half;
  for (let i = 0; i < 800; i += 1) {
    slots.push({ date, half });
    if (date === end.date && half === end.half) return slots;
    if (half === 0) {
      half = 1;
    } else {
      date = addDays(date, 1);
      half = 0;
    }
  }
  return slots;
}

/** Rectangle de cases (lignes × créneaux) entre deux coins, pour clic-glisser. */
export function planCellsInRect(
  start: PlanCellId,
  end: PlanCellId,
  rowIds: string[],
): PlanCellId[] {
  const i0 = rowIds.indexOf(start.rowId);
  const i1 = rowIds.indexOf(end.rowId);
  const rows =
    i0 >= 0 && i1 >= 0
      ? rowIds.slice(Math.min(i0, i1), Math.max(i0, i1) + 1)
      : [start.rowId];
  const cells: PlanCellId[] = [];
  for (const rowId of rows) {
    const slots = timeHalves(start, end);
    for (const slot of slots) {
      cells.push({ rowId, date: slot.date, half: slot.half });
    }
  }
  return cells;
}

export function unionPlanCellKeys(
  current: Iterable<string>,
  extra: PlanCellId[],
): Set<string> {
  const next = new Set(current);
  for (const cell of extra) next.add(planCellKey(cell));
  return next;
}

export function togglePlanCellKey(
  current: Iterable<string>,
  cell: PlanCellId,
): Set<string> {
  const key = planCellKey(cell);
  const next = new Set(current);
  if (next.has(key)) next.delete(key);
  else next.add(key);
  return next;
}

function runPlanningSelectionSelfCheck() {
  const rows = ["emp-a", "emp-b", "emp-c"];
  const start = { rowId: "emp-a", date: "2026-09-21", half: 0 as const };
  const same = planCellsInRect(start, start, rows);
  if (same.length !== 1 || planCellKey(same[0]!) !== "emp-a|2026-09-21|0") {
    throw new Error("planning-selection: une case");
  }
  const across = planCellsInRect(
    start,
    { rowId: "emp-a", date: "2026-09-22", half: 1 },
    rows,
  );
  if (across.length !== 4) {
    throw new Error(
      `planning-selection: lun matin → mar après-midi = 4 cases, reçu ${across.length}`,
    );
  }
  const rect = planCellsInRect(
    start,
    { rowId: "emp-b", date: "2026-09-21", half: 1 },
    rows,
  );
  if (rect.length !== 4) {
    throw new Error(
      `planning-selection: 2 salariés × matin+après-midi = 4, reçu ${rect.length}`,
    );
  }
  const parsed = parsePlanCellKey("emp-a|2026-09-21|1");
  if (!parsed || parsed.half !== 1) {
    throw new Error("planning-selection: parse data-plan-cell");
  }
}
runPlanningSelectionSelfCheck();
