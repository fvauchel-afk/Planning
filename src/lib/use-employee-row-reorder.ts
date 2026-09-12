"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { planningRows, type CalendarRow } from "@/lib/calendar";
import { persistEmployeeOrdersFromVisualRowIds } from "@/lib/employee-row-order";
import { LOGISTIQUE_ROW_ID, type Employee } from "@/lib/types";

type RowOrderUpdate = { id: string; ordre_affichage: number };

function orderIdsFromPointerY(
  ids: string[],
  draggedId: string,
  clientY: number,
): string[] {
  const others = ids.filter((id) => id !== draggedId);
  const next: string[] = [];
  let inserted = false;
  for (const id of others) {
    const el = document.querySelector(`[data-plan-row="${id}"]`);
    const rect = el?.getBoundingClientRect();
    const mid = rect ? rect.top + rect.height / 2 : Number.POSITIVE_INFINITY;
    if (!inserted && clientY < mid) {
      next.push(draggedId);
      inserted = true;
    }
    next.push(id);
  }
  if (!inserted) next.push(draggedId);
  return next;
}

export function useEmployeeRowReorder({
  employees,
  enabled,
  onCommit,
}: {
  employees: Employee[];
  enabled: boolean;
  onCommit: (rows: RowOrderUpdate[]) => Promise<void>;
}) {
  const baseRows = useMemo(() => planningRows(employees), [employees]);
  const [previewIds, setPreviewIds] = useState<string[] | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const dragRef = useRef<{
    pointerId: number;
    rowId: string;
    startY: number;
    moved: boolean;
    order: string[];
    initial: string[];
  } | null>(null);
  const savingRef = useRef(false);
  const displayRowsRef = useRef<CalendarRow[]>([]);
  const onCommitRef = useRef(onCommit);
  onCommitRef.current = onCommit;

  const displayRows = useMemo(() => {
    if (!previewIds) return baseRows;
    const byId = new Map(baseRows.map((row) => [row.id, row]));
    return previewIds
      .map((id) => byId.get(id))
      .filter((row): row is CalendarRow => Boolean(row));
  }, [baseRows, previewIds]);
  displayRowsRef.current = displayRows;

  useEffect(() => {
    if (dragRef.current) return;
    setPreviewIds(null);
  }, [employees]);

  const finish = useCallback(async (event: ReactPointerEvent<HTMLElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    dragRef.current = null;
    setDraggingId(null);
    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {
      // Capture déjà relâchée.
    }
    if (!drag.moved || savingRef.current) {
      setPreviewIds(null);
      return;
    }
    const nextIds = drag.order;
    const same =
      nextIds.length === drag.initial.length &&
      nextIds.every((id, index) => id === drag.initial[index]);
    if (same) {
      setPreviewIds(null);
      return;
    }
    setPreviewIds(nextIds);
    const updates = persistEmployeeOrdersFromVisualRowIds(nextIds);
    if (updates.length === 0) {
      setPreviewIds(null);
      return;
    }
    savingRef.current = true;
    try {
      await onCommitRef.current(updates);
    } catch {
      setPreviewIds(null);
    } finally {
      savingRef.current = false;
    }
  }, []);

  const rowHandleProps = useCallback(
    (rowId: string) => {
      const canDrag = enabled && rowId !== LOGISTIQUE_ROW_ID;
      return {
        onPointerDown: (event: ReactPointerEvent<HTMLElement>) => {
          if (!canDrag) return;
          if (event.button !== 0) return;
          const target = event.target as HTMLElement;
          if (target.closest("button, a, input, textarea")) return;
          event.preventDefault();
          event.currentTarget.setPointerCapture(event.pointerId);
          const order = displayRowsRef.current.map((row) => row.id);
          dragRef.current = {
            pointerId: event.pointerId,
            rowId,
            startY: event.clientY,
            moved: false,
            order,
            initial: [...order],
          };
          setDraggingId(rowId);
          setPreviewIds(order);
        },
        onPointerMove: (event: ReactPointerEvent<HTMLElement>) => {
          const drag = dragRef.current;
          if (!drag || drag.pointerId !== event.pointerId) return;
          if (!drag.moved && Math.abs(event.clientY - drag.startY) < 6) return;
          drag.moved = true;
          event.preventDefault();
          const next = orderIdsFromPointerY(drag.order, drag.rowId, event.clientY);
          drag.order = next;
          setPreviewIds(next);
        },
        onPointerUp: (event: ReactPointerEvent<HTMLElement>) => {
          void finish(event);
        },
        onPointerCancel: (event: ReactPointerEvent<HTMLElement>) => {
          void finish(event);
        },
      };
    },
    [enabled, finish],
  );

  return { displayRows, draggingId, rowHandleProps, reordering: Boolean(draggingId) };
}
