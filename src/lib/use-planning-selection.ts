"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  planCellFromPoint,
  planCellKey,
  planCellsInRect,
  togglePlanCellKey,
  unionPlanCellKeys,
  type PlanCellId,
} from "@/lib/planning-selection";

export function usePlanningSelection(rowIds: string[]) {
  const [keys, setKeys] = useState<Set<string>>(() => new Set());
  const paintRef = useRef<{
    pointerId: number;
    origin: PlanCellId;
    additive: boolean;
    seeded: boolean;
  } | null>(null);
  const anchorRef = useRef<PlanCellId | null>(null);
  const rowIdsRef = useRef(rowIds);
  rowIdsRef.current = rowIds;

  const clear = useCallback(() => {
    paintRef.current = null;
    setKeys(new Set());
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") clear();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [clear]);

  const applyRect = useCallback(
    (origin: PlanCellId, current: PlanCellId, additive: boolean) => {
      const rect = planCellsInRect(origin, current, rowIdsRef.current);
      setKeys((prev) =>
        additive ? unionPlanCellKeys(prev, rect) : new Set(rect.map(planCellKey)),
      );
    },
    [],
  );

  const beginPaint = useCallback(
    (event: { pointerId: number; ctrlKey: boolean; metaKey: boolean; shiftKey: boolean; clientX: number; clientY: number }, cell: PlanCellId) => {
      const additive = event.ctrlKey || event.metaKey;
      if (event.shiftKey && anchorRef.current) {
        applyRect(anchorRef.current, cell, additive);
        return;
      }
      anchorRef.current = cell;
      paintRef.current = {
        pointerId: event.pointerId,
        origin: cell,
        additive,
        seeded: !additive,
      };
      if (additive) {
        setKeys((prev) => togglePlanCellKey(prev, cell));
      } else {
        setKeys(new Set([planCellKey(cell)]));
      }
    },
    [applyRect],
  );

  const extendPaint = useCallback((clientX: number, clientY: number) => {
    const paint = paintRef.current;
    if (!paint) return;
    const cell = planCellFromPoint(clientX, clientY);
    if (!cell) return;
    if (
      paint.additive &&
      !paint.seeded &&
      cell.rowId === paint.origin.rowId &&
      cell.date === paint.origin.date &&
      cell.half === paint.origin.half
    ) {
      return;
    }
    paint.seeded = true;
    applyRect(paint.origin, cell, paint.additive);
  }, [applyRect]);

  const endPaint = useCallback((pointerId: number) => {
    if (paintRef.current?.pointerId === pointerId) paintRef.current = null;
  }, []);

  const isSelected = useCallback(
    (cell: PlanCellId) => keys.has(planCellKey(cell)),
    [keys],
  );

  const cells = useMemo(() => {
    const list: PlanCellId[] = [];
    Array.from(keys).forEach((key) => {
      const parsed = key.split("|");
      const half = Number(parsed[2]);
      if (parsed[0] && parsed[1] && (half === 0 || half === 1)) {
        list.push({ rowId: parsed[0], date: parsed[1], half });
      }
    });
    list.sort((a, b) =>
      a.rowId === b.rowId
        ? a.date === b.date
          ? a.half - b.half
          : a.date.localeCompare(b.date)
        : a.rowId.localeCompare(b.rowId),
    );
    return list;
  }, [keys]);

  return {
    keys,
    cells,
    count: keys.size,
    isSelected,
    beginPaint,
    extendPaint,
    endPaint,
    painting: () => Boolean(paintRef.current),
    clear,
  };
}
