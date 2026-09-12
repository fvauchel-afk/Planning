"use client";

import { useEffect, useMemo, useRef, useState, type PointerEvent } from "react";
import {
  AbsenceChip,
  AssignmentChip,
  absencesForCell,
  assignmentIndex,
  assignmentsForCell,
  assignmentsForDay,
  firstChantierOccurrence,
  planningRows,
  slotsForPhase,
  type CalendarAssignment,
} from "@/lib/calendar";
import { AbsenceImprevueModal } from "@/components/AbsenceImprevueModal";
import { ChantierEditModal } from "@/components/ChantierEditModal";
import { PhaseFicheModal } from "@/components/PhaseFicheModal";
import { colorForChantier } from "@/lib/colors";
import {
  addDays,
  addMonths,
  eachDay,
  eachDayInclusive,
  endOfMonthIso,
  formatDayHeader,
  formatLongDate,
  formatMonthYear,
  isSunday,
  startOfMonthIso,
  startOfWeekIso,
  toISODate,
} from "@/lib/dates";
import { formatClock, hoursForSlot, workWindowsForRow } from "@/lib/engine/hours";
import {
  previewHalves,
  shiftChantierBlock,
  type OccupiedHalf,
} from "@/lib/engine/drag-shift";
import { halfFromLabel } from "@/lib/engine/slots";
import { usePlanning } from "@/lib/planning-context";
import { PRIORITE_LABELS, type Chantier, type Employee } from "@/lib/types";
import { WelcomeBanner } from "@/components/WelcomeBanner";
import {
  STATUT_CHANTIER_COLORS,
  STATUT_CHANTIER_LABELS,
  STATUTS_CHANTIER,
  chantierPlanningInfo,
} from "@/lib/chantier-status";

type ViewMode = "overview" | "week" | "day";

export function CalendarBoard() {
  const { snapshot, loading, error, usingSupabase, applyPhasePatches } =
    usePlanning();
  const [view, setView] = useState<ViewMode>("overview");
  const [todayIso, setTodayIso] = useState(() => toISODate(new Date()));
  const [cursorIso, setCursorIso] = useState(todayIso);
  const [selectedPhaseId, setSelectedPhaseId] = useState<string | null>(null);
  const [absenceEmployee, setAbsenceEmployee] = useState<Employee | null>(null);
  const [editingChantier, setEditingChantier] = useState<Chantier | null>(null);
  const [dragError, setDragError] = useState<string | null>(null);
  const [dragPreview, setDragPreview] = useState<Set<string> | null>(null);
  const dragRef = useRef<{
    pointerId: number;
    rowId: string;
    chantierId: string;
    grab: OccupiedHalf;
    startX: number;
    moved: boolean;
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

  const days = useMemo(() => {
    if (view === "day") return [cursorIso];
    if (view === "week") return eachDay(startOfWeekIso(cursorIso), 7);
    return eachDayInclusive(startOfMonthIso(cursorIso), endOfMonthIso(cursorIso));
  }, [cursorIso, view]);
  const rangeStart = days[0] ?? cursorIso;
  const rangeEnd = days[days.length - 1] ?? cursorIso;
  const periodLabel =
    view === "overview"
      ? formatMonthYear(cursorIso)
      : view === "week"
        ? `${formatDayHeader(rangeStart).date} – ${formatDayHeader(rangeEnd).date}`
        : formatLongDate(cursorIso);
  const rows = useMemo(
    () => planningRows(snapshot.employees),
    [snapshot.employees],
  );

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

  function updateDragPreview(clientX: number, clientY: number) {
    const drag = dragRef.current;
    if (!drag) return;
    const drop = planCellFromPoint(clientX, clientY);
    if (!drop || drop.rowId !== drag.rowId) {
      setDragPreview(new Set());
      return;
    }
    const result = shiftChantierBlock({
      snapshot,
      rowId: drag.rowId,
      chantierId: drag.chantierId,
      grab: drag.grab,
      drop,
    });
    const keys = new Set<string>();
    const delta = result.delta;
    for (const block of result.chain) {
      for (const half of previewHalves(block, delta)) {
        keys.add(`${block.rowId}|${half.date}|${half.half}`);
      }
    }
    if (keys.size === 0) {
      keys.add(`${drag.rowId}|${drag.grab.date}|${drag.grab.half}`);
    }
    setDragPreview(keys);
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
    const drop = planCellFromPoint(clientX, clientY);
    if (!drop || drop.rowId !== drag.rowId || savingDrag.current) return;
    const { patches } = shiftChantierBlock({
      snapshot,
      rowId: drag.rowId,
      chantierId: drag.chantierId,
      grab: drag.grab,
      drop,
    });
    if (patches.length === 0) return;
    savingDrag.current = true;
    setDragError(null);
    try {
      await applyPhasePatches(patches);
    } catch (err) {
      setDragError(
        err instanceof Error ? err.message : "Déplacement impossible à enregistrer.",
      );
    } finally {
      savingDrag.current = false;
    }
  }

  function shift(direction: number) {
    if (view === "day") {
      setCursorIso((current) => addDays(current, direction));
      return;
    }
    if (view === "week") {
      setCursorIso((current) => addDays(current, direction * 7));
      return;
    }
    setCursorIso((current) => addMonths(current, direction));
  }

  function goToday() {
    setCursorIso(toISODate(new Date()));
  }

  return (
    <section className="space-y-4">
      <WelcomeBanner />
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-serif text-3xl text-stone-900">Planning équipe</h2>
          <p className="mt-1 text-sm text-stone-600">
            Une ligne par personne, chaque jour en matin / après-midi. Le
            thermolaquage sous-traité a sa propre ligne. Glissez un chantier
            sur la même ligne pour le décaler (les blocs collés suivent).
            {usingSupabase
              ? " Données connectées à Supabase."
              : " Mode local (configurez Supabase pour la base partagée)."}
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
              onClick={() => shift(-1)}
              className="rounded border border-stone-300 bg-white px-2 py-1.5 text-sm"
            >
              ←
            </button>
            <button
              type="button"
              onClick={goToday}
              className="rounded border border-stone-300 bg-white px-3 py-1.5 text-sm"
            >
              Aujourd&apos;hui
            </button>
            <button
              type="button"
              onClick={() => shift(1)}
              className="rounded border border-stone-300 bg-white px-2 py-1.5 text-sm"
            >
              →
            </button>
            <span className="ml-1 text-sm font-medium capitalize text-stone-700">
              {periodLabel}
            </span>
          </div>
        </div>
      </div>

      {dragError && (
        <p className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {dragError}
        </p>
      )}
      {error && (
        <p className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      )}
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
                inView
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
        <DayDetail
          iso={cursorIso}
          todayIso={todayIso}
          snapshot={snapshot}
          focusCell={focusCell}
          onSelectDay={setCursorIso}
          onOpenPhase={setSelectedPhaseId}
          onAbsence={setAbsenceEmployee}
        />
      ) : (
        <div className={`overflow-auto rounded-lg border border-stone-300 bg-white shadow-sm ${dragPreview ? "select-none" : ""}`}>
          <table className="min-w-full border-collapse text-sm">
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
                      className={`min-w-[110px] border-b border-l border-stone-300 px-1 py-2 text-center ${
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
                <tr key={row.id} className="align-top">
                  <th className="sticky left-0 z-10 border-b border-r border-stone-300 bg-stone-50 px-3 py-2 text-left">
                    <div className="font-medium text-stone-900">{row.label}</div>
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
                    const absences = absencesForCell(
                      snapshot.absences,
                      row.employee?.id ?? null,
                      iso,
                    );
                    const compact = view === "overview";
                    return (["matin", "apres_midi"] as const).map((slot) => {
                      const half = halfFromLabel(slot);
                      const slotOff =
                        hoursForSlot(snapshot, row.id, iso, half) <= 0;
                      const assignments = assignmentsForCell(
                        snapshot,
                        row.id,
                        iso,
                        slot,
                      );
                      const cellKey = `${row.id}|${iso}|${half}`;
                      const dropTarget = dragPreview?.has(cellKey);
                      const focused =
                        focusCell?.rowId === row.id &&
                        focusCell.date === iso &&
                        focusCell.half === half;
                      return (
                      <td
                        key={`${row.id}-${iso}-${slot}`}
                        data-plan-cell={cellKey}
                        className={`h-16 border-b border-l border-stone-200 p-1 ${
                          focused
                            ? "bg-amber-200 ring-2 ring-inset ring-amber-600"
                            : dropTarget
                              ? "bg-amber-100"
                              : iso === todayIso
                                ? "bg-yellow-100"
                                : isSunday(iso) || slotOff
                                  ? "bg-stone-50/80"
                                  : "bg-white"
                        }`}
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
                            <PhaseChipButton
                              key={`${assignment.phase.id}-${slot}`}
                              assignment={assignment}
                              compact={compact}
                              dragging={Boolean(dragPreview)}
                              onPointerDragStart={(event) => {
                                event.currentTarget.setPointerCapture(
                                  event.pointerId,
                                );
                                dragRef.current = {
                                  pointerId: event.pointerId,
                                  rowId: row.id,
                                  chantierId: assignment.chantier.id,
                                  grab: { date: iso, half },
                                  startX: event.clientX,
                                  moved: false,
                                };
                                setDragError(null);
                              }}
                              onPointerDragMove={(event) => {
                                const drag = dragRef.current;
                                if (!drag || drag.pointerId !== event.pointerId) {
                                  return;
                                }
                                if (
                                  !drag.moved &&
                                  Math.abs(event.clientX - drag.startX) < 8
                                ) {
                                  return;
                                }
                                drag.moved = true;
                                event.preventDefault();
                                updateDragPreview(event.clientX, event.clientY);
                              }}
                              onPointerDragEnd={(event, phaseId) => {
                                if (dragRef.current?.pointerId !== event.pointerId) {
                                  return;
                                }
                                void finishDrag(event.clientX, event.clientY, phaseId);
                              }}
                            />
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
      </>
      )}
    </section>
  );
}

function DayDetail({
  iso,
  todayIso,
  snapshot,
  focusCell,
  onSelectDay,
  onOpenPhase,
  onAbsence,
}: {
  iso: string;
  todayIso: string;
  snapshot: ReturnType<typeof usePlanning>["snapshot"];
  focusCell: { rowId: string; date: string; half: 0 | 1 } | null;
  onSelectDay: (iso: string) => void;
  onOpenPhase: (phaseId: string) => void;
  onAbsence: (employee: Employee) => void;
}) {
  const rows = planningRows(snapshot.employees);
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
        <div className="flex gap-1">
          <button
            type="button"
            className="rounded border border-stone-300 bg-white px-2 py-1 text-sm"
            onClick={() => onSelectDay(addDays(iso, -1))}
          >
            Jour précédent
          </button>
          <button
            type="button"
            className="rounded border border-stone-300 bg-white px-2 py-1 text-sm"
            onClick={() => onSelectDay(addDays(iso, 1))}
          >
            Jour suivant
          </button>
        </div>
      </div>
      <div className="overflow-hidden rounded-lg border border-stone-300 bg-white">
        <div className="grid grid-cols-[200px_1fr] border-b border-stone-200 bg-stone-100 text-sm font-medium">
          <div className="px-3 py-2">Personne</div>
          <div className="border-l border-stone-200 px-3 py-2">Horaires réels</div>
        </div>
        {rows.map((row) => {
          const absences = absencesForCell(
            snapshot.absences,
            row.employee?.id ?? null,
            iso,
          );
          const windows = workWindowsForRow(snapshot, row.id, iso);
          const assignments = assignmentsForDay(snapshot, row.id, iso);
          const dayStart = windows[0]?.start ?? 7 * 60;
          const dayEnd = windows[windows.length - 1]?.end ?? 17 * 60;
          const span = Math.max(1, dayEnd - dayStart);
          return (
            <div
              key={row.id}
              data-plan-row={row.id}
              className={`grid grid-cols-[200px_1fr] border-b border-stone-200 last:border-b-0 ${
                focusCell?.rowId === row.id && focusCell.date === iso
                  ? "bg-amber-50"
                  : isToday
                    ? "bg-yellow-50"
                    : ""
              }`}
            >
              <div className="bg-stone-50 px-3 py-3">
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
              </div>
              <div className="relative min-h-[96px] border-l border-stone-200 p-3">
                {absences.map((absence) => (
                  <AbsenceChip key={absence.id} absence={absence} />
                ))}
                {windows.length > 0 && absences.length === 0 && (
                  <div className="relative h-16">
                    {windows.map((window) => (
                      <div
                        key={`${row.id}-${window.half}`}
                        className="absolute top-0 h-full rounded bg-stone-100"
                        style={{
                          left: `${((window.start - dayStart) / span) * 100}%`,
                          width: `${((window.end - window.start) / span) * 100}%`,
                        }}
                      />
                    ))}
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
                          return (
                            <button
                              key={`${assignment.phase.id}-${start}`}
                              type="button"
                              data-plan-cell={`${row.id}|${iso}|${slot.half}`}
                              className={`absolute top-1 h-[56px] overflow-hidden rounded px-1.5 py-0.5 text-left text-[11px] leading-tight ${
                                focusCell?.rowId === row.id &&
                                focusCell.date === iso &&
                                focusCell.half === slot.half
                                  ? "ring-2 ring-amber-600"
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
                              title={`${formatClock(start)}–${formatClock(end)} · ${assignment.chantier.nom_client}`}
                              onClick={() => onOpenPhase(assignment.phase.id)}
                            >
                              <span className="block font-semibold">
                                {formatClock(start)}–{formatClock(end)}
                              </span>
                              <span className="block truncate">
                                {assignment.chantier.nom_client}
                              </span>
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

function PhaseChipButton({
  assignment,
  compact,
  dragging,
  onPointerDragStart,
  onPointerDragMove,
  onPointerDragEnd,
}: {
  assignment: CalendarAssignment;
  compact?: boolean;
  dragging?: boolean;
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
      className={`block w-full touch-none text-left ${dragging ? "cursor-grabbing" : "cursor-grab"}`}
      onPointerDown={onPointerDragStart}
      onPointerMove={onPointerDragMove}
      onPointerUp={(event) => onPointerDragEnd(event, assignment.phase.id)}
      onPointerCancel={(event) => onPointerDragEnd(event, assignment.phase.id)}
    >
      <AssignmentChip assignment={assignment} compact={compact} />
    </button>
  );
}
