"use client";

import { useEffect, useMemo, useRef, useState, type PointerEvent } from "react";
import {
  AbsenceChip,
  AssignmentChip,
  absencesForCell,
  assignmentIndex,
  assignmentClockLabel,
  assignmentsForCell,
  assignmentsForDay,
  firstChantierOccurrence,
  planningRows,
  rowHoursInDays,
  slotsForPhase,
  type CalendarAssignment,
} from "@/lib/calendar";
import { AbsenceImprevueModal } from "@/components/AbsenceImprevueModal";
import { CreateFromSelectionModal } from "@/components/CreateFromSelectionModal";
import { FormNotice } from "@/components/FormNotice";
import { ChantierEditModal } from "@/components/ChantierEditModal";
import { LaunchValidateButton } from "@/components/LaunchValidateButton";
import { PhaseFicheModal } from "@/components/PhaseFicheModal";
import { ReceptionModal } from "@/components/ReceptionModal";
import { planningReceptionChipLabel } from "@/lib/reception/planning-chip";
import { colorForChantier } from "@/lib/colors";
import {
  addDays,
  addMonths,
  eachDay,
  eachDayInclusive,
  endOfMonthIso,
  formatDayHeader,
  formatLongDate,
  formatDisplayedDay,
  formatMonthYear,
  isSunday,
  startOfMonthIso,
  startOfWeekIso,
  toISODate,
} from "@/lib/dates";
import { formatClock, formatHoursLabel, hoursForSlot, workWindowsForRow } from "@/lib/engine/hours";
import {
  shiftIndependentHalves,
  type IndependentHalf,
  type OccupiedHalf,
} from "@/lib/engine/drag-shift";
import { clampToWorkWindows } from "@/lib/engine/hour-grid";
import { halfFromLabel } from "@/lib/engine/slots";
import { usePlanning } from "@/lib/planning-context";
import { useFormDraftReopen } from "@/lib/form-draft";
import { useEmployeeRowReorder } from "@/lib/use-employee-row-reorder";
import { usePlanningSelection } from "@/lib/use-planning-selection";
import { useSession } from "@/lib/auth/session-context";
import {
  LOGISTIQUE_ROW_ID,
  PRIORITE_LABELS,
  TRANSPORT_ROW_ID,
  type Chantier,
  type Employee,
} from "@/lib/types";
import {
  type EmptyCellPick,
} from "@/lib/engine/create-from-selection";
import { WelcomeBanner } from "@/components/WelcomeBanner";
import { SaisonActiveBadge } from "@/components/SaisonActiveBadge";
import {
  STATUT_CHANTIER_COLORS,
  STATUT_CHANTIER_LABELS,
  STATUTS_CHANTIER,
  chantierPlanningInfo,
} from "@/lib/chantier-status";
import { phaseAwaitingChantierLance } from "@/lib/dates-estimatives";

type ViewMode = "overview" | "week" | "day";
type DragScope = "libre";

function halfSelectKey(
  rowId: string,
  phaseId: string,
  date: string,
  half: 0 | 1,
): string {
  return `${rowId}|${phaseId}|${date}|${half}`;
}

function shiftCursor(view: ViewMode, iso: string, direction: number): string {
  if (view === "day") return addDays(iso, direction);
  if (view === "week") return addDays(iso, direction * 7);
  return addMonths(iso, direction);
}

function daysForCursor(view: ViewMode, iso: string): string[] {
  if (view === "day") return [iso];
  if (view === "week") return eachDay(startOfWeekIso(iso), 7);
  return eachDayInclusive(startOfMonthIso(iso), endOfMonthIso(iso));
}

export function CalendarBoard() {
  const { snapshot, loading, error, usingSupabase, applyPhaseEdits, reorderEmployees } =
    usePlanning();
  const { reopen, clearReopen } = useFormDraftReopen();
  const { session } = useSession();
  const [view, setView] = useState<ViewMode>("overview");
  const dragScope: DragScope = "libre";
  const [selectedHalves, setSelectedHalves] = useState<IndependentHalf[]>([]);
  const [todayIso, setTodayIso] = useState(() => toISODate(new Date()));
  const [cursorIso, setCursorIso] = useState(todayIso);
  const periodPaneRef = useRef<HTMLDivElement>(null);
  const [selectedPhaseId, setSelectedPhaseId] = useState<string | null>(null);
  const [receptionPhaseId, setReceptionPhaseId] = useState<string | null>(null);
  const [absenceEmployee, setAbsenceEmployee] = useState<Employee | null>(null);
  const [editingChantier, setEditingChantier] = useState<Chantier | null>(null);
  const [emptyPicks, setEmptyPicks] = useState<EmptyCellPick[]>([]);
  const [createFromSelection, setCreateFromSelection] = useState(false);


  useEffect(() => {
    if (reopen?.kind !== "chantier") return;
    if (loading) return;
    const found = snapshot.chantiers.find((item) => item.id === reopen.id);
    if (found) setEditingChantier(found);
    clearReopen();
  }, [reopen, loading, snapshot.chantiers, clearReopen]);
  const [dragError, setDragError] = useState<string | null>(null);
  const [dragPreview, setDragPreview] = useState<{
    cells: Set<string>;
    blocked: boolean;
  } | null>(null);
  const dragRef = useRef<{
    pointerId: number;
    rowId: string;
    chantierId: string;
    phaseId: string;
    scope: DragScope;
    selected: IndependentHalf[];
    grab: OccupiedHalf;
    startX: number;
    startY: number;
    moved: boolean;
    startMin?: number;
  } | null>(null);
  const savingDrag = useRef(false);
  const [focusCell, setFocusCell] = useState<{
    rowId: string;
    date: string;
    half: 0 | 1;
    token: number;
  } | null>(null);

  useEffect(() => {
    const tick = () => setTodayIso(toISODate(new Date()));
    tick();
    const interval = window.setInterval(tick, 30_000);
    const onVisible = () => {
      if (document.visibilityState === "visible") tick();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  const days = useMemo(() => daysForCursor(view, cursorIso), [cursorIso, view]);
  const rangeStart = days[0] ?? cursorIso;
  const rangeEnd = days[days.length - 1] ?? cursorIso;
  const periodLabel =
    view === "overview"
      ? formatMonthYear(cursorIso)
      : view === "week"
        ? `${formatDayHeader(rangeStart).date} – ${formatDayHeader(rangeEnd).date}`
        : formatDisplayedDay(cursorIso);
  const { displayRows: rows, draggingId, rowHandleProps, reordering } =
    useEmployeeRowReorder({
      employees: snapshot.employees,
      enabled: Boolean(session?.isAdmin),
      onCommit: async (ordered) => {
        setDragError(null);
        try {
          await reorderEmployees(ordered);
        } catch (err) {
          setDragError(
            err instanceof Error
              ? err.message
              : "Impossible d’enregistrer l’ordre des lignes.",
          );
          throw err;
        }
      },
    });
  const rowIds = useMemo(() => rows.map((row) => row.id), [rows]);
  const selection = usePlanningSelection(rowIds);
  const paintMovedRef = useRef(false);

  useEffect(() => {
    const picks: EmptyCellPick[] = [];
    const halves: IndependentHalf[] = [];
    for (const cell of selection.cells) {
      if (
        cell.rowId === TRANSPORT_ROW_ID ||
        cell.rowId === LOGISTIQUE_ROW_ID
      ) {
        continue;
      }
      const slot = cell.half === 0 ? "matin" : "apres_midi";
      const asg = assignmentsForCell(snapshot, cell.rowId, cell.date, slot);
      if (asg.length > 0) {
        for (const assignment of asg) {
          halves.push({
            rowId: cell.rowId,
            phaseId: assignment.phase.id,
            date: cell.date,
            half: cell.half,
          });
        }
        continue;
      }
      const row = rows.find((item) => item.id === cell.rowId);
      const absences = absencesForCell(
        snapshot,
        row?.employee?.id ?? null,
        cell.date,
        cell.half,
      );
      const slotOff = hoursForSlot(snapshot, cell.rowId, cell.date, cell.half) <= 0;
      if (session?.isAdmin && row?.employee && absences.length === 0 && !slotOff) {
        picks.push({ rowId: cell.rowId, date: cell.date, half: cell.half });
      }
    }
    setEmptyPicks(picks);
    setSelectedHalves(halves);
  }, [selection.cells, snapshot, rows, session]);

  function beginPlanSelect(
    event: {
      pointerId: number;
      ctrlKey: boolean;
      metaKey: boolean;
      shiftKey: boolean;
      clientX: number;
      clientY: number;
    },
    cell: { rowId: string; date: string; half: 0 | 1 },
  ) {
    paintMovedRef.current = false;
    selection.beginPaint(event, cell);
  }

  function extendPlanSelect(clientX: number, clientY: number) {
    if (!selection.painting()) return;
    paintMovedRef.current = true;
    selection.extendPaint(clientX, clientY);
  }

  const chantiersInView = useMemo(() => {
    if (loading) return [];
    assignmentIndex(snapshot);
    const ids = new Set<string>();
    for (const day of days) {
      for (const row of rows) {
        for (const assignment of [
          ...assignmentsForCell(snapshot, row.id, day, "matin"),
          ...assignmentsForCell(snapshot, row.id, day, "apres_midi"),
        ]) {
          ids.add(assignment.chantier.id);
        }
      }
    }
    return snapshot.chantiers.filter((chantier) => ids.has(chantier.id));
  }, [days, loading, rows, snapshot]);

  const selectedKeys = useMemo(
    () =>
      new Set(
        selectedHalves.map((item) =>
          halfSelectKey(item.rowId, item.phaseId, item.date, item.half),
        ),
      ),
    [selectedHalves],
  );

  function planCellFromPoint(clientX: number, clientY: number) {
    const node = document
      .elementFromPoint(clientX, clientY)
      ?.closest("[data-plan-cell]");
    const raw = node?.getAttribute("data-plan-cell");
    if (!raw) return null;
    const [rowId, date, halfRaw] = raw.split("|");
    if (!rowId || !date || (halfRaw !== "0" && halfRaw !== "1")) return null;
    return { rowId, date, half: Number(halfRaw) as 0 | 1 };
  }

  function planDayDropFromPoint(clientX: number, clientY: number) {
    const node = document
      .elementFromPoint(clientX, clientY)
      ?.closest("[data-plan-track]");
    if (!node) return null;
    const raw = node.getAttribute("data-plan-track");
    if (!raw) return null;
    const [rowId, date, startRaw, endRaw] = raw.split("|");
    if (!rowId || !date) return null;
    const dayStart = Number(startRaw);
    const dayEnd = Number(endRaw);
    if (!Number.isFinite(dayStart) || !Number.isFinite(dayEnd) || dayEnd <= dayStart) {
      return null;
    }
    const rect = node.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / Math.max(1, rect.width)));
    const rawMin = dayStart + ratio * (dayEnd - dayStart);
    const windows = workWindowsForRow(snapshot, rowId, date);
    const clamped = clampToWorkWindows(windows, rawMin);
    if (!clamped) return null;
    return {
      rowId,
      date,
      half: clamped.half,
      startMin: clamped.minutes,
    };
  }

  function computeMove(
    drag: NonNullable<typeof dragRef.current>,
    drop: OccupiedHalf & { rowId: string; startMin?: number },
  ) {
    return shiftIndependentHalves({
      snapshot,
      fromRowId: drag.rowId,
      toRowId: drop.rowId,
      phaseId: drag.phaseId,
      grab: { date: drag.grab.date, half: drag.grab.half },
      drop: { date: drop.date, half: drop.half },
      selected: drag.selected,
    });
  }

  function updateDragPreview(clientX: number, clientY: number) {
    const drag = dragRef.current;
    if (!drag) return;
    const drop =
      view === "day" && drag.startMin != null
        ? planDayDropFromPoint(clientX, clientY)
        : planCellFromPoint(clientX, clientY);
    if (!drop) {
      setDragPreview({ cells: new Set(), blocked: false });
      return;
    }
    const result = computeMove(drag, drop);
    const keys = new Set<string>();
    for (const cell of result.preview) {
      keys.add(`${cell.rowId}|${cell.date}|${cell.half}`);
    }
    if (keys.size === 0) {
      keys.add(`${drag.rowId}|${drag.grab.date}|${drag.grab.half}`);
    }
    setDragPreview({ cells: keys, blocked: result.blocked });
  }

  function onEmptyCellClick(
    rowId: string,
    date: string,
    half: 0 | 1,
    additive: boolean,
  ) {
    if (!session?.isAdmin) return;
    if (rowId === TRANSPORT_ROW_ID || rowId === LOGISTIQUE_ROW_ID) return;
    if (additive || paintMovedRef.current) return;
    setCreateFromSelection(true);
  }

  function beginChipDrag(
    event: PointerEvent<HTMLButtonElement>,
    rowId: string,
    chantierId: string,
    phaseId: string,
    date: string,
    half: 0 | 1,
    startMin?: number,
  ) {
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      pointerId: event.pointerId,
      rowId,
      chantierId,
      phaseId,
      scope: dragScope,
      selected: selectedHalves,
      grab: { date, half, startMin },
      startX: event.clientX,
      startY: event.clientY,
      moved: false,
      startMin,
    };
    setDragError(null);
  }

  function jumpToChantier(chantierId: string) {
    const first = firstChantierOccurrence(snapshot, chantierId);
    if (!first) return;
    const inRange = first.date >= rangeStart && first.date <= rangeEnd;
    if (!inRange) setCursorIso(first.date);
    setFocusCell({ ...first, token: Date.now() });
  }

  useEffect(() => {
    if (!focusCell) return;
    const key = `${focusCell.rowId}|${focusCell.date}|${focusCell.half}`;
    const frame = window.setTimeout(() => {
      const node =
        document.querySelector(`[data-plan-cell="${key}"]`) ??
        document.querySelector(`[data-plan-row="${focusCell.rowId}"]`);
      node?.scrollIntoView({
        behavior: "smooth",
        block: "center",
        inline: "center",
      });
    }, 80);
    const clear = window.setTimeout(() => setFocusCell(null), 3500);
    return () => {
      window.clearTimeout(frame);
      window.clearTimeout(clear);
    };
  }, [focusCell, days, view, cursorIso]);

  async function finishDrag(clientX: number, clientY: number, phaseId: string) {
    const drag = dragRef.current;
    dragRef.current = null;
    setDragPreview(null);
    if (!drag) return;
    if (!drag.moved) {
      setSelectedPhaseId(phaseId);
      return;
    }
    const drop =
      view === "day" && drag.startMin != null
        ? planDayDropFromPoint(clientX, clientY)
        : planCellFromPoint(clientX, clientY);
    if (!drop || savingDrag.current) return;
    const result = computeMove(drag, drop);
    if (result.blocked) {
      setDragError(
        drag.scope === "libre"
          ? "Créneau non libre : les blocs sont revenus à leur place. Déposez sur une case vide, pendant les horaires du salarié (pas d’absence, pas de 0 h)."
          : "Créneau occupé : le chantier est revenu à sa place. Impossible de déposer sur une absence ou un créneau hors horaire (0 h).",
      );
      return;
    }
    if (result.patches.length === 0 && !result.inserts?.length) return;
    savingDrag.current = true;
    setDragError(null);
    try {
      await applyPhaseEdits({
        patches: result.patches,
        inserts: result.inserts,
      });
      if (drag.scope === "libre") {
        setSelectedHalves([]);
        selection.clear();
      }
    } catch (err) {
      setDragError(
        err instanceof Error ? err.message : "Déplacement impossible à enregistrer.",
      );
    } finally {
      savingDrag.current = false;
    }
  }

  function shift(direction: number) {
    setCursorIso((current) => shiftCursor(view, current, direction));
  }

  const periodWheelLock = useRef(false);
  function onPeriodWheel(event: {
    deltaX: number;
    deltaY: number;
    currentTarget: HTMLDivElement;
    preventDefault: () => void;
  }) {
    if (Math.abs(event.deltaX) >= Math.abs(event.deltaY)) return;
    if (Math.abs(event.deltaY) < 28) return;
    const el = event.currentTarget;
    const goingDown = event.deltaY > 0;
    const fits = el.scrollHeight <= el.clientHeight + 8;
    const atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 8;
    const atTop = el.scrollTop <= 8;
    if (!fits) {
      if (goingDown && !atBottom) return;
      if (!goingDown && !atTop) return;
    }
    event.preventDefault();
    if (periodWheelLock.current) return;
    periodWheelLock.current = true;
    shift(goingDown ? 1 : -1);
    window.setTimeout(() => {
      periodWheelLock.current = false;
    }, 420);
    requestAnimationFrame(() => {
      el.scrollTop = goingDown ? 0 : Math.max(0, el.scrollHeight - el.clientHeight);
    });
  }

  useEffect(() => {
    const el = periodPaneRef.current;
    if (!el) return;
    const handler = (event: WheelEvent) => {
      onPeriodWheel({
        deltaX: event.deltaX,
        deltaY: event.deltaY,
        currentTarget: el,
        preventDefault: () => event.preventDefault(),
      });
    };
    el.addEventListener("wheel", handler, { passive: false });
    return () => el.removeEventListener("wheel", handler);
  });

  function goToday() {
    setCursorIso(toISODate(new Date()));
  }

  return (
    <section className="space-y-4">
      <WelcomeBanner />
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="font-serif text-3xl text-stone-900">Planning équipe</h2>
            <SaisonActiveBadge />
          </div>
          <p className="mt-1 text-sm text-stone-600">
            Une ligne par personne, chaque jour en matin / après-midi (l’heure
            est écrite sur le bloc). En vue Jour, vous déposez au cran de
            30 minutes ; un trou en fin de journée reste vide. Le thermolaquage sous-traité et les livraisons ont chacun leur ligne.
            Les livraisons restent aussi sur la ligne du salarié responsable.
            Glissez un ou plusieurs blocs vers une case vide, y compris en vue
            Jour. Seuls ces blocs bougent — pas toute la suite du chantier, et
            pas de saut automatique vers le prochain trou. Un dépôt sur une
            case déjà prise, une absence ou un créneau hors horaire à 0 h
            (vendredi après-midi en 35 h, week-end) est annulé.
            Glissez une ligne de salarié (clic gauche maintenu sur le nom)
            pour changer l’ordre d’affichage, enregistré pour tout le monde.
            Défilez vers le bas pour passer au mois, à la semaine ou au jour
            suivant (plus de flèches ‹ ›). La Vue d’ensemble montre le mois
            entier, du 1er au dernier jour : élargissez ou faites défiler
            horizontalement si besoin.
            {usingSupabase
              ? " Données connectées à Supabase."
              : ""}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-md border border-stone-300 bg-white p-0.5">
            {(
              [
                ["overview", "Vue d'ensemble"],
                ["week", "Semaine"],
                ["day", "Jour détaillé"],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => {
                  setView(id);
                  setCursorIso(toISODate(new Date()));
                }}
                className={`rounded px-3 py-1.5 text-sm ${
                  view === id
                    ? "bg-stone-900 text-white"
                    : "text-stone-700 hover:bg-stone-100"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="inline-flex items-center gap-1">
            <button
              type="button"
              onClick={goToday}
              title="Revenir à aujourd’hui"
              className="min-w-[9.5rem] rounded border border-stone-300 bg-white px-3 py-1.5 text-sm font-medium capitalize text-stone-800"
            >
              {periodLabel}
            </button>
          </div>
        </div>
      </div>

      <p className="rounded border border-stone-200 bg-stone-50 px-3 py-2 text-sm text-stone-700">
        Clic-glisser sur la grille, Ctrl+clic (Cmd sur Mac) ou Maj+clic pour
        choisir plusieurs cases — vides ou déjà occupées. Les blocs cochés se
        glissent vers une case <strong>vide</strong> ; un clic sur une case
        vide ouvre encore la création de chantier.
        {selectedHalves.length > 0
          ? ` ${selectedHalves.length} bloc${selectedHalves.length > 1 ? "s" : ""} choisi${selectedHalves.length > 1 ? "s" : ""}.`
          : ""}
      </p>
      {dragError ? <FormNotice>{dragError}</FormNotice> : null}
      {error ? <FormNotice>{error}</FormNotice> : null}
      {session?.isAdmin && emptyPicks.length === 0 && selectedHalves.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2 rounded border border-sky-200 bg-sky-50 px-3 py-2 text-sm text-sky-950">
          <span>
            {selectedHalves.length} bloc{selectedHalves.length > 1 ? "s" : ""}{" "}
            choisi{selectedHalves.length > 1 ? "s" : ""} — glissez vers une case
            vide, ou Échap pour annuler.
          </span>
          <button
            type="button"
            onClick={() => selection.clear()}
            className="rounded border border-sky-300 bg-white px-3 py-1.5 text-sm"
          >
            Tout désélectionner
          </button>
        </div>
      ) : null}
      {session?.isAdmin && emptyPicks.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2 rounded border border-sky-200 bg-sky-50 px-3 py-2 text-sm text-sky-950">
          <span>
            {emptyPicks.length} case{emptyPicks.length > 1 ? "s" : ""} vide
            {emptyPicks.length > 1 ? "s" : ""}
            {selectedHalves.length > 0
              ? ` et ${selectedHalves.length} bloc${selectedHalves.length > 1 ? "s" : ""}`
              : ""}{" "}
            — clic-glisser, Ctrl+clic (Cmd sur Mac) ou Maj+clic pour étendre.
          </span>
          <button
            type="button"
            onClick={() => setCreateFromSelection(true)}
            className="rounded bg-sky-800 px-3 py-1.5 text-sm font-medium text-white"
          >
            Créer un chantier
          </button>
          <button
            type="button"
            onClick={() => {
              setEmptyPicks([]);
              setCreateFromSelection(false);
            }}
            className="rounded border border-sky-300 bg-white px-3 py-1.5 text-sm"
          >
            Annuler
          </button>
        </div>
      ) : null}
      {loading ? (
        <p className="text-sm text-stone-500">Chargement du planning…</p>
      ) : (
      <>
      <div className="flex flex-wrap items-center gap-3 text-[11px] text-stone-600">
        {STATUTS_CHANTIER.map((statut) => (
          <span key={statut} className="inline-flex items-center gap-1.5">
            <span
              className="h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: STATUT_CHANTIER_COLORS[statut].dot }}
            />
            {STATUT_CHANTIER_LABELS[statut]}
          </span>
        ))}
      </div>
      <div className="flex flex-wrap gap-2">
        {snapshot.chantiers.map((chantier) => {
          const info = chantierPlanningInfo(snapshot, chantier.id);
          const inView = chantiersInView.some((item) => item.id === chantier.id);
          const planned = info.statut !== "non_planifie";
          const colors = STATUT_CHANTIER_COLORS[info.statut];
          return (
            <span
              key={chantier.id}
              className={`inline-flex items-center rounded-full border text-xs text-stone-700 ${
                info.estimatif
                  ? "border-dashed border-violet-300 bg-violet-50"
                  : inView
                    ? "border-stone-200 bg-white"
                    : "border-dashed border-stone-300 bg-stone-50"
              }`}
            >
              <button
                type="button"
                disabled={!planned}
                onClick={() => jumpToChantier(chantier.id)}
                title={info.rangeLabel ?? info.title}
                className={`inline-flex items-center gap-2 rounded-l-full px-2.5 py-1 ${
                  planned
                    ? "hover:bg-amber-50"
                    : "cursor-default opacity-70"
                }`}
              >
                <span
                  className="h-2.5 w-2.5 rounded-full"
                  style={{ backgroundColor: colors.dot }}
                  title={info.title}
                />
                {chantier.nom_client}
                {info.estimatif ? (
                  <span className="rounded bg-violet-200/80 px-1.5 py-px text-[10px] font-semibold uppercase tracking-wide text-violet-900">
                    Estimatif
                  </span>
                ) : null}
                <span className="text-stone-400">
                  {PRIORITE_LABELS[chantier.priorite]}
                  {inView ? "" : " · hors période"}
                </span>
              </button>
              <button
                type="button"
                className="rounded-r-full px-2 py-1 text-sm leading-none hover:bg-amber-50"
                title="Modifier le chantier"
                onClick={(event) => {
                  event.stopPropagation();
                  setEditingChantier(chantier);
                }}
              >
                ✏️
              </button>
            </span>
          );
        })}
      </div>

      {view === "day" ? (
        <div
          ref={periodPaneRef}
          className="max-h-[calc(100dvh-12rem)] min-h-[24rem] overflow-auto"
        >
        <DayDetail
          iso={cursorIso}
          todayIso={todayIso}
          snapshot={snapshot}
          rows={rows}
          canReorder={Boolean(session?.isAdmin)}
          draggingId={draggingId}
          dragPreview={dragPreview}
          selectedKeys={selectedKeys}
          rowHandleProps={rowHandleProps}
          focusCell={focusCell}
          onOpenPhase={setSelectedPhaseId}
          onReception={setReceptionPhaseId}
          onAbsence={setAbsenceEmployee}
          onEmptyCellClick={onEmptyCellClick}
          onPlanSelectStart={beginPlanSelect}
          onPlanSelectMove={extendPlanSelect}
          onPlanSelectEnd={(pointerId) => selection.endPaint(pointerId)}
          isPlanCellSelected={(cell) => selection.isSelected(cell)}
          onChipDragStart={(event, rowId, chantierId, phaseId, date, half, startMin) => {
            if (event.ctrlKey || event.metaKey || event.shiftKey) {
              event.preventDefault();
              beginPlanSelect(event, { rowId, date, half });
              return;
            }
            beginChipDrag(event, rowId, chantierId, phaseId, date, half, startMin);
          }}
          onChipDragMove={(event) => {
            if (selection.painting()) {
              extendPlanSelect(event.clientX, event.clientY);
              return;
            }
            const drag = dragRef.current;
            if (!drag || drag.pointerId !== event.pointerId) return;
            if (
              !drag.moved &&
              Math.abs(event.clientX - drag.startX) < 8 &&
              Math.abs(event.clientY - drag.startY) < 8
            ) {
              return;
            }
            drag.moved = true;
            event.preventDefault();
            updateDragPreview(event.clientX, event.clientY);
          }}
          onChipDragEnd={(event, phaseId) => {
            selection.endPaint(event.pointerId);
            if (event.ctrlKey || event.metaKey || event.shiftKey) return;
            if (!dragRef.current) {
              setSelectedPhaseId(phaseId);
              return;
            }
            if (dragRef.current.pointerId !== event.pointerId) return;
            void finishDrag(event.clientX, event.clientY, phaseId);
          }}
        />
        </div>
      ) : (
        <div
          ref={periodPaneRef}
          className={`max-h-[calc(100dvh-12rem)] min-h-[24rem] overflow-auto rounded-lg border border-stone-300 bg-white shadow-sm ${dragPreview || reordering ? "select-none" : ""}`}
        >
          <table
            className={`${view === "week" ? "min-w-full" : ""} border-collapse text-sm`}
            style={
              view === "overview"
                ? { minWidth: `${160 + days.length * 148}px` }
                : undefined
            }
          >
            <thead>
              <tr className="bg-stone-100">
                <th className="sticky left-0 z-10 min-w-[160px] border-b border-r border-stone-300 bg-stone-100 px-3 py-2 text-left font-medium">
                  Équipe
                </th>
                {days.map((iso) => {
                  const header = formatDayHeader(iso);
                  const isToday = iso === todayIso;
                  return (
                    <th
                      key={iso}
                      colSpan={2}
                      className={`border-b border-l border-stone-300 px-1 py-2 text-center ${
                        view === "overview" ? "min-w-[9rem]" : "min-w-[110px]"
                      } ${
                        isToday
                          ? "bg-yellow-200 text-stone-900"
                          : isSunday(iso)
                            ? "bg-stone-50 text-stone-400"
                            : ""
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => {
                          setCursorIso(iso);
                          setView("day");
                        }}
                        className="w-full"
                      >
                        <div className="text-[11px] uppercase tracking-wide">
                          {header.weekday}
                        </div>
                        <div className="font-medium">{header.date}</div>
                      </button>
                    </th>
                  );
                })}
              </tr>
              <tr className="bg-stone-50 text-[10px] uppercase tracking-wide text-stone-500">
                <th className="sticky left-0 z-10 border-b border-r border-stone-300 bg-stone-50" />
                {days.flatMap((iso) => [
                  <th
                    key={`${iso}-am`}
                    className={`border-b border-l border-stone-200 px-1 py-1 font-normal ${
                      iso === todayIso ? "bg-yellow-100" : ""
                    }`}
                  >
                    Matin
                  </th>,
                  <th
                    key={`${iso}-pm`}
                    className={`border-b border-l border-stone-200 px-1 py-1 font-normal ${
                      iso === todayIso ? "bg-yellow-100" : ""
                    }`}
                  >
                    A-midi
                  </th>,
                ])}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr
                  key={row.id}
                  data-plan-row={row.id}
                  className={`align-top ${draggingId === row.id ? "opacity-60" : ""}`}
                >
                  <th
                    className={`sticky left-0 z-10 border-b border-r border-stone-300 bg-stone-50 px-3 py-2 text-left ${
                      session?.isAdmin && row.employee
                        ? draggingId === row.id
                          ? "cursor-grabbing touch-none"
                          : "cursor-grab touch-none"
                        : ""
                    }`}
                    title={
                      session?.isAdmin && row.employee
                        ? "Glisser pour réordonner la ligne"
                        : undefined
                    }
                    {...rowHandleProps(row.id)}
                  >
                    <div className="font-medium text-stone-900">{row.label}</div>
                    {view === "week" ? (
                      <div className="text-[11px] font-semibold tabular-nums text-amber-900">
                        {formatHoursLabel(rowHoursInDays(snapshot, row.id, days))}
                      </div>
                    ) : null}
                    <div className="text-[11px] font-normal capitalize text-stone-500">
                      {row.subtitle}
                    </div>
                    {row.employee && (
                      <button
                        type="button"
                        className="mt-1 text-[11px] font-normal text-amber-800 underline"
                        onClick={() => setAbsenceEmployee(row.employee)}
                      >
                        Absence imprévue
                      </button>
                    )}
                  </th>
                  {days.flatMap((iso) => {
                    const compact = view === "overview";
                    return (["matin", "apres_midi"] as const).map((slot) => {
                      const half = halfFromLabel(slot);
                      const absences = absencesForCell(
                        snapshot,
                        row.employee?.id ?? null,
                        iso,
                        half,
                      );
                      const slotOff =
                        hoursForSlot(snapshot, row.id, iso, half) <= 0;
                      const cellAssignments = assignmentsForCell(
                          snapshot,
                          row.id,
                          iso,
                          slot,
                        );
                      const assignments = cellAssignments;
                      const cellId = { rowId: row.id, date: iso, half };
                      const cellKey = `${row.id}|${iso}|${half}`;
                      const dropTarget = dragPreview?.cells.has(cellKey);
                      const emptySelected = selection.isSelected(cellId);
                      const canCreate =
                        Boolean(session?.isAdmin) &&
                        row.employee &&
                        cellAssignments.length === 0 &&
                        absences.length === 0 &&
                        !slotOff;
                      const focused =
                        focusCell?.rowId === row.id &&
                        focusCell.date === iso &&
                        focusCell.half === half;
                      return (
                      <td
                        key={`${row.id}-${iso}-${slot}`}
                        data-plan-cell={cellKey}
                        onPointerDown={(event) => {
                          if (event.button !== 0) return;
                          const target = event.target as HTMLElement;
                          if (target.closest("button")) return;
                          event.preventDefault();
                          event.currentTarget.setPointerCapture(event.pointerId);
                          beginPlanSelect(event, cellId);
                        }}
                        onPointerMove={(event) => {
                          extendPlanSelect(event.clientX, event.clientY);
                        }}
                        onPointerUp={(event) => selection.endPaint(event.pointerId)}
                        onPointerCancel={(event) =>
                          selection.endPaint(event.pointerId)
                        }
                        className={`h-16 border-b border-l border-stone-200 p-1 ${
                          emptySelected
                            ? "bg-sky-100 ring-2 ring-inset ring-sky-600"
                          : focused
                            ? "bg-amber-200 ring-2 ring-inset ring-amber-600"
                            : dropTarget && dragPreview?.blocked
                              ? "bg-red-200 ring-2 ring-inset ring-red-500"
                            : dropTarget
                              ? "bg-amber-100"
                              : iso === todayIso
                                ? "bg-yellow-100"
                                : isSunday(iso) || slotOff
                                  ? "bg-stone-50/80"
                                  : "bg-white"
                        } ${canCreate ? "cursor-pointer" : ""}`}
                        onClick={(event) => {
                          if (!canCreate || dragPreview) return;
                          if (event.ctrlKey || event.metaKey || event.shiftKey) {
                            return;
                          }
                          onEmptyCellClick(
                            row.id,
                            iso,
                            half,
                            false,
                          );
                        }}
                      >
                        <div className="flex flex-col gap-1">
                          {absences.map((absence) => (
                            <AbsenceChip
                              key={`${absence.id}-${slot}`}
                              absence={absence}
                              compact={compact}
                            />
                          ))}
                          {assignments.map((assignment) => (
                            <div key={`${assignment.phase.id}-${slot}`}>
                            <PhaseChipButton
                              key={`${assignment.phase.id}-${slot}`}
                              assignment={assignment}
                              compact={compact}
                              dragging={Boolean(dragPreview)}
                              selected={selectedKeys.has(
                                halfSelectKey(
                                  row.id,
                                  assignment.phase.id,
                                  iso,
                                  half,
                                ),
                              )}
                              showLivraisonAddress={row.id === TRANSPORT_ROW_ID}
                              allowDrag={row.id !== TRANSPORT_ROW_ID}
                              clockLabel={assignmentClockLabel(snapshot, assignment)}
                              onSelectCell={(event) => {
                                event.preventDefault();
                                beginPlanSelect(event, {
                                  rowId: row.id,
                                  date: iso,
                                  half,
                                });
                              }}
                              onPointerDragStart={(event) => {
                                beginChipDrag(
                                  event,
                                  row.id,
                                  assignment.chantier.id,
                                  assignment.phase.id,
                                  iso,
                                  half,
                                );
                              }}
                              onPointerDragMove={(event) => {
                                if (selection.painting()) {
                                  extendPlanSelect(event.clientX, event.clientY);
                                  return;
                                }
                                const drag = dragRef.current;
                                if (!drag || drag.pointerId !== event.pointerId) {
                                  return;
                                }
                                if (
                                  !drag.moved &&
                                  Math.abs(event.clientX - drag.startX) < 8 &&
                                  Math.abs(event.clientY - drag.startY) < 8
                                ) {
                                  return;
                                }
                                drag.moved = true;
                                event.preventDefault();
                                updateDragPreview(event.clientX, event.clientY);
                              }}
                              onPointerDragEnd={(event, phaseId) => {
                                selection.endPaint(event.pointerId);
                                if (event.ctrlKey || event.metaKey || event.shiftKey) {
                                  return;
                                }
                                if (!dragRef.current) {
                                  setSelectedPhaseId(phaseId);
                                  return;
                                }
                                if (dragRef.current.pointerId !== event.pointerId) {
                                  return;
                                }
                                void finishDrag(event.clientX, event.clientY, phaseId);
                              }}
                            />
                            <LaunchValidateButton
                              phaseId={assignment.phase.id}
                              compact
                            />
                            <PlanningReceptionButton
                              phase={assignment.phase}
                              compact
                              onClick={() =>
                                setReceptionPhaseId(assignment.phase.id)
                              }
                            />
                            </div>
                          ))}
                        </div>
                      </td>
                    );
                    });
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {editingChantier && (
        <ChantierEditModal
          chantier={editingChantier}
          onClose={() => setEditingChantier(null)}
        />
      )}
      {absenceEmployee && (
        <AbsenceImprevueModal
          employee={absenceEmployee}
          onClose={() => setAbsenceEmployee(null)}
        />
      )}
      {selectedPhaseId && (
        <PhaseFicheModal
          phaseId={selectedPhaseId}
          onClose={() => setSelectedPhaseId(null)}
        />
      )}
      {createFromSelection && emptyPicks.length > 0 ? (
        <CreateFromSelectionModal
          picks={emptyPicks}
          onClose={() => setCreateFromSelection(false)}
          onCreated={() => {
            setCreateFromSelection(false);
            setEmptyPicks([]);
          }}
        />
      ) : null}
      {receptionPhaseId ? (
        <ReceptionModal
          phaseId={receptionPhaseId}
          onClose={() => setReceptionPhaseId(null)}
        />
      ) : null}
      </>
      )}
    </section>
  );
}

function DayDetail({
  iso,
  todayIso,
  snapshot,
  rows,
  canReorder,
  draggingId,
  dragPreview,
  selectedKeys,
  rowHandleProps,
  focusCell,
  onOpenPhase,
  onReception,
  onAbsence,
  onEmptyCellClick,
  onPlanSelectStart,
  onPlanSelectMove,
  onPlanSelectEnd,
  isPlanCellSelected,
  onChipDragStart,
  onChipDragMove,
  onChipDragEnd,
}: {
  iso: string;
  todayIso: string;
  snapshot: ReturnType<typeof usePlanning>["snapshot"];
  rows: ReturnType<typeof planningRows>;
  canReorder: boolean;
  draggingId: string | null;
  dragPreview: { cells: Set<string>; blocked: boolean } | null;
  selectedKeys: Set<string>;
  rowHandleProps: ReturnType<typeof useEmployeeRowReorder>["rowHandleProps"];
  focusCell: { rowId: string; date: string; half: 0 | 1 } | null;
  onOpenPhase: (phaseId: string) => void;
  onReception: (phaseId: string) => void;
  onAbsence: (employee: Employee) => void;
  onEmptyCellClick: (
    rowId: string,
    date: string,
    half: 0 | 1,
    additive: boolean,
  ) => void;
  onPlanSelectStart: (
    event: {
      pointerId: number;
      ctrlKey: boolean;
      metaKey: boolean;
      shiftKey: boolean;
      clientX: number;
      clientY: number;
    },
    cell: { rowId: string; date: string; half: 0 | 1 },
  ) => void;
  onPlanSelectMove: (clientX: number, clientY: number) => void;
  onPlanSelectEnd: (pointerId: number) => void;
  isPlanCellSelected: (cell: { rowId: string; date: string; half: 0 | 1 }) => boolean;
  onChipDragStart: (
    event: PointerEvent<HTMLButtonElement>,
    rowId: string,
    chantierId: string,
    phaseId: string,
    date: string,
    half: 0 | 1,
    startMin?: number,
  ) => void;
  onChipDragMove: (event: PointerEvent<HTMLButtonElement>) => void;
  onChipDragEnd: (
    event: PointerEvent<HTMLButtonElement>,
    phaseId: string,
  ) => void;
}) {
  const isToday = iso === todayIso;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3
          className={`font-serif text-2xl capitalize ${
            isToday ? "rounded bg-yellow-200 px-2 py-1 text-stone-900" : "text-stone-900"
          }`}
        >
          {formatLongDate(iso)}
        </h3>
      </div>
      <div className="overflow-hidden rounded-lg border border-stone-300 bg-white">
        <div className="grid grid-cols-[200px_1fr] border-b border-stone-200 bg-stone-100 text-sm font-medium">
          <div className="px-3 py-2">Personne</div>
          <div className="border-l border-stone-200 px-3 py-2">Horaires réels</div>
        </div>
        {rows.map((row) => {
          const absences = absencesForCell(
            snapshot,
            row.employee?.id ?? null,
            iso,
          );
          const windows = workWindowsForRow(snapshot, row.id, iso);
          const dayAssignments = assignmentsForDay(snapshot, row.id, iso);
          const assignments = dayAssignments;
          const dayStart = windows[0]?.start ?? 7 * 60;
          const dayEnd = windows[windows.length - 1]?.end ?? 17 * 60;
          const span = Math.max(1, dayEnd - dayStart);
          return (
            <div
              key={row.id}
              data-plan-row={row.id}
              className={`grid grid-cols-[200px_1fr] border-b border-stone-200 last:border-b-0 ${
                draggingId === row.id
                  ? "opacity-60"
                  : focusCell?.rowId === row.id && focusCell.date === iso
                    ? "bg-amber-50"
                    : isToday
                      ? "bg-yellow-50"
                      : ""
              }`}
            >
              <div
                className={`bg-stone-50 px-3 py-3 ${
                  canReorder && row.employee
                    ? draggingId === row.id
                      ? "cursor-grabbing touch-none"
                      : "cursor-grab touch-none"
                    : ""
                }`}
                title={
                  canReorder && row.employee
                    ? "Glisser pour réordonner la ligne"
                    : undefined
                }
                {...rowHandleProps(row.id)}
              >
                <div className="font-medium">{row.label}</div>
                <div className="text-xs capitalize text-stone-500">
                  {row.subtitle}
                </div>
                <div className="mt-1 text-[11px] text-stone-600">
                  {windows.length > 0
                    ? windows
                        .map(
                          (window) =>
                            `${formatClock(window.start)}–${formatClock(window.end)}`,
                        )
                        .join(" · ")
                    : "Non travaillé"}
                </div>
                {row.employee && (
                  <button
                    type="button"
                    className="mt-1 text-[11px] text-amber-800 underline"
                    onClick={() => onAbsence(row.employee!)}
                  >
                    Absence imprévue
                  </button>
                )}
                {assignments
                  .filter((item) => phaseAwaitingChantierLance(item.phase))
                  .map((item) => (
                    <div key={`launch-${item.phase.id}`} className="mt-2">
                      <LaunchValidateButton phaseId={item.phase.id} compact />
                    </div>
                  ))}
                {dayAssignments
                  .filter((item) => planningReceptionChipLabel(item.phase))
                  .map((item) => (
                  <PlanningReceptionButton
                    key={`reception-${item.phase.id}`}
                    phase={item.phase}
                    onClick={() => onReception(item.phase.id)}
                  />
                ))}
              </div>
              <div className="relative min-h-[96px] border-l border-stone-200 p-3">
                {absences.map((absence) => (
                  <AbsenceChip key={absence.id} absence={absence} />
                ))}
                {windows.length > 0 && absences.length === 0 && (
                  <div
                    className="relative mt-3 h-16"
                    data-plan-track={`${row.id}|${iso}|${dayStart}|${dayEnd}`}
                  >
                    {Array.from(
                      { length: Math.floor((dayEnd - dayStart) / 30) + 1 },
                      (_, index) => dayStart + index * 30,
                    )
                      .filter((mark) =>
                        windows.some((window) => mark >= window.start && mark <= window.end),
                      )
                      .map((mark) => (
                        <div
                          key={`tick-${mark}`}
                          className="pointer-events-none absolute top-0 h-full border-l border-stone-300/70"
                          style={{
                            left: `${((mark - dayStart) / span) * 100}%`,
                          }}
                        >
                          <span className="absolute -top-3 left-0 -translate-x-1/2 text-[9px] tabular-nums text-stone-400">
                            {formatClock(mark)}
                          </span>
                        </div>
                      ))}
                    {windows.map((window) => {
                      const cellKey = `${row.id}|${iso}|${window.half}`;
                      const dropTarget = dragPreview?.cells.has(cellKey);
                      const slot = window.half === 0 ? "matin" : "apres_midi";
                      const cellAssignments = assignmentsForCell(
                        snapshot,
                        row.id,
                        iso,
                        slot,
                      );
                      const cellId = { rowId: row.id, date: iso, half: window.half };
                      const emptySelected = isPlanCellSelected(cellId);
                      const canCreate =
                        canReorder &&
                        Boolean(row.employee) &&
                        cellAssignments.length === 0 &&
                        absences.length === 0;
                      return (
                      <div
                        key={`${row.id}-${window.half}`}
                        data-plan-cell={cellKey}
                        className={`absolute top-0 h-full rounded ${
                          emptySelected
                            ? "bg-sky-100 ring-2 ring-inset ring-sky-600"
                            : dropTarget && dragPreview?.blocked
                            ? "bg-red-200 ring-2 ring-inset ring-red-500"
                            : dropTarget
                              ? "bg-amber-100"
                              : "bg-stone-100"
                        } ${canCreate ? "cursor-pointer" : ""}`}
                        style={{
                          left: `${((window.start - dayStart) / span) * 100}%`,
                          width: `${((window.end - window.start) / span) * 100}%`,
                        }}
                        onPointerDown={(event) => {
                          if (event.button !== 0) return;
                          event.preventDefault();
                          event.currentTarget.setPointerCapture(event.pointerId);
                          onPlanSelectStart(event, cellId);
                        }}
                        onPointerMove={(event) => {
                          onPlanSelectMove(event.clientX, event.clientY);
                        }}
                        onPointerUp={(event) => onPlanSelectEnd(event.pointerId)}
                        onPointerCancel={(event) =>
                          onPlanSelectEnd(event.pointerId)
                        }
                        onClick={(event) => {
                          if (!canCreate || dragPreview) return;
                          if (event.ctrlKey || event.metaKey || event.shiftKey) {
                            return;
                          }
                          onEmptyCellClick(row.id, iso, window.half, false);
                        }}
                      />
                      );
                    })}
                    {assignments.flatMap((assignment) =>
                      slotsForPhase(snapshot, assignment.phase.id)
                        .filter(
                          (slot) =>
                            slot.rowId === row.id &&
                            slot.date === iso &&
                            slot.startMin != null &&
                            slot.endMin != null,
                        )
                        .map((slot) => {
                          const start = slot.startMin!;
                          const end = slot.endMin!;
                          const allowDrag = row.id !== TRANSPORT_ROW_ID;
                          const cellKey = `${row.id}|${iso}|${slot.half}`;
                          const dropTarget = dragPreview?.cells.has(cellKey);
                          return (
                            <button
                              key={`${assignment.phase.id}-${start}`}
                              type="button"
                              data-plan-cell={cellKey}
                              className={`absolute top-1 z-[1] h-[56px] overflow-hidden rounded px-1.5 py-0.5 text-left text-[11px] leading-tight ${
                                allowDrag
                                  ? `touch-none ${dragPreview ? "cursor-grabbing" : "cursor-grab"}`
                                  : "cursor-pointer"
                              } ${
                                selectedKeys.has(
                                  halfSelectKey(
                                    row.id,
                                    assignment.phase.id,
                                    iso,
                                    slot.half,
                                  ),
                                )
                                  ? "ring-2 ring-sky-600"
                                  : focusCell?.rowId === row.id &&
                                focusCell.date === iso &&
                                focusCell.half === slot.half
                                  ? "ring-2 ring-amber-600"
                                  : dropTarget && dragPreview?.blocked
                                    ? "ring-2 ring-red-500"
                                  : phaseAwaitingChantierLance(assignment.phase)
                                    ? "ring-2 ring-orange-500"
                                    : ""
                              }`}
                              style={{
                                left: `${((start - dayStart) / span) * 100}%`,
                                width: `${Math.max(8, ((end - start) / span) * 100)}%`,
                                backgroundColor: colorForChantier(
                                  assignment.chantier.id,
                                ).bg,
                                color: colorForChantier(assignment.chantier.id).fg,
                              }}
                              title={`${formatClock(start)}–${formatClock(end)} · ${assignment.chantier.nom_client}${
                                row.id === TRANSPORT_ROW_ID &&
                                assignment.chantier.adresse_livraison
                                  ? ` · ${assignment.chantier.adresse_livraison}`
                                  : ""
                              }`}
                              onPointerDown={
                                allowDrag
                                  ? (event) => {
                                      if (
                                        event.ctrlKey ||
                                        event.metaKey ||
                                        event.shiftKey
                                      ) {
                                        event.preventDefault();
                                        onPlanSelectStart(event, {
                                          rowId: row.id,
                                          date: iso,
                                          half: slot.half,
                                        });
                                        return;
                                      }
                                      onChipDragStart(
                                        event,
                                        row.id,
                                        assignment.chantier.id,
                                        assignment.phase.id,
                                        iso,
                                        slot.half,
                                        start,
                                      );
                                    }
                                  : undefined
                              }
                              onPointerMove={(event) => {
                                onPlanSelectMove(event.clientX, event.clientY);
                                if (allowDrag) onChipDragMove(event);
                              }}
                              onPointerUp={(event) => {
                                onPlanSelectEnd(event.pointerId);
                                if (
                                  event.ctrlKey ||
                                  event.metaKey ||
                                  event.shiftKey
                                ) {
                                  return;
                                }
                                if (allowDrag) {
                                  onChipDragEnd(event, assignment.phase.id);
                                  return;
                                }
                                onOpenPhase(assignment.phase.id);
                              }}
                              onPointerCancel={(event) => {
                                if (allowDrag) {
                                  onChipDragEnd(event, assignment.phase.id);
                                }
                              }}
                            >
                              <span className="block font-semibold">
                                {formatClock(start)}–{formatClock(end)}
                              </span>
                              <span className="block truncate">
                                {assignment.chantier.nom_client}
                              </span>
                              {row.id === TRANSPORT_ROW_ID &&
                              assignment.chantier.adresse_livraison ? (
                                <span className="block truncate opacity-90">
                                  {assignment.chantier.adresse_livraison}
                                </span>
                              ) : null}
                              {phaseAwaitingChantierLance(assignment.phase) ? (
                                <span className="mt-0.5 inline-block rounded bg-orange-600 px-1 text-[9px] font-semibold uppercase tracking-wide text-orange-50">
                                  ⚠ à valider
                                </span>
                              ) : assignment.phase.dates_estimatives ? (
                                <span className="mt-0.5 inline-block rounded bg-violet-900/80 px-1 text-[9px] font-semibold uppercase tracking-wide text-violet-50">
                                  Estimatif
                                </span>
                              ) : null}
                            </button>
                          );
                        }),
                    )}
                  </div>
                )}
                {assignments.length === 0 && absences.length === 0 && (
                  <p className="mt-2 text-xs text-stone-400">Libre</p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function PlanningReceptionButton({
  phase,
  compact,
  onClick,
}: {
  phase: CalendarAssignment["phase"];
  compact?: boolean;
  onClick: () => void;
}) {
  const label = planningReceptionChipLabel(phase);
  if (!label) return null;
  return (
    <button
      type="button"
      className={
        compact
          ? "mt-0.5 w-full rounded bg-sky-800 px-1 py-0.5 text-[10px] font-medium text-sky-50"
          : "mt-1 text-[11px] text-sky-800 underline"
      }
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
    >
      {label}
    </button>
  );
}

function PhaseChipButton({
  assignment,
  compact,
  dragging,
  selected,
  showLivraisonAddress,
  allowDrag = true,
  clockLabel,
  onSelectCell,
  onPointerDragStart,
  onPointerDragMove,
  onPointerDragEnd,
}: {
  assignment: CalendarAssignment;
  compact?: boolean;
  dragging?: boolean;
  selected?: boolean;
  showLivraisonAddress?: boolean;
  allowDrag?: boolean;
  clockLabel?: string | null;
  onSelectCell?: (event: PointerEvent<HTMLButtonElement>) => void;
  onPointerDragStart: (event: PointerEvent<HTMLButtonElement>) => void;
  onPointerDragMove: (event: PointerEvent<HTMLButtonElement>) => void;
  onPointerDragEnd: (
    event: PointerEvent<HTMLButtonElement>,
    phaseId: string,
  ) => void;
}) {
  return (
    <button
      type="button"
      className={`block w-full text-left ${
        allowDrag
          ? `touch-none ${dragging ? "cursor-grabbing" : "cursor-grab"}`
          : "cursor-pointer"
      } ${selected ? "rounded ring-2 ring-sky-600" : ""}`}
      onPointerDown={(event) => {
        if (event.ctrlKey || event.metaKey || event.shiftKey) {
          onSelectCell?.(event);
          return;
        }
        if (allowDrag) onPointerDragStart(event);
      }}
      onPointerMove={allowDrag ? onPointerDragMove : undefined}
      onPointerUp={(event) => {
        if (event.ctrlKey || event.metaKey || event.shiftKey) return;
        onPointerDragEnd(event, assignment.phase.id);
      }}
      onPointerCancel={(event) =>
        onPointerDragEnd(event, assignment.phase.id)
      }
    >
      <AssignmentChip
        assignment={assignment}
        compact={compact}
        showLivraisonAddress={showLivraisonAddress}
        clockLabel={clockLabel}
      />
    </button>
  );
}
