"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AbsenceChip,
  AssignmentChip,
  absencesForCell,
  assignmentIndex,
  assignmentsForCell,
  assignmentsForDay,
  planningRows,
  slotsForPhase,
  type CalendarAssignment,
} from "@/lib/calendar";
import { AbsenceImprevueModal } from "@/components/AbsenceImprevueModal";
import { PhaseFicheModal } from "@/components/PhaseFicheModal";
import { colorForChantier } from "@/lib/colors";
import {
  addDays,
  eachDay,
  formatDayHeader,
  formatLongDate,
  isSunday,
  parseISODate,
  startOfWeekMonday,
  toISODate,
} from "@/lib/dates";
import { formatClock, hoursForSlot, workWindowsForRow } from "@/lib/engine/hours";
import { halfFromLabel } from "@/lib/engine/slots";
import { usePlanning } from "@/lib/planning-context";
import { PRIORITE_LABELS, type Employee } from "@/lib/types";
import { WelcomeBanner } from "@/components/WelcomeBanner";

type ViewMode = "overview" | "week" | "day";

export function CalendarBoard() {
  const { snapshot, loading, error, usingSupabase } = usePlanning();
  const [view, setView] = useState<ViewMode>("overview");
  const [anchor, setAnchor] = useState(() => startOfWeekMonday(new Date()));
  const [selectedDay, setSelectedDay] = useState(toISODate(new Date()));
  const [selectedPhaseId, setSelectedPhaseId] = useState<string | null>(null);
  const [absenceEmployee, setAbsenceEmployee] = useState<Employee | null>(null);

  useEffect(() => {
    const newest = [...snapshot.chantiers].sort((a, b) =>
      a.date_creation.localeCompare(b.date_creation),
    ).at(-1);
    if (!newest) return;
    const elementIds = snapshot.elements
      .filter((element) => element.chantier_id === newest.id)
      .map((element) => element.id);
    const starts = snapshot.phases
      .filter(
        (phase) =>
          elementIds.includes(phase.element_id) && Boolean(phase.date_debut),
      )
      .map((phase) => phase.date_debut!.slice(0, 10))
      .sort();
    if (starts[0]) {
      setAnchor(startOfWeekMonday(parseISODate(starts[0])));
      setSelectedDay(starts[0]);
    }
  }, [snapshot.chantiers, snapshot.elements, snapshot.phases]);

  const dayCount = view === "overview" ? 56 : view === "week" ? 7 : 1;
  const rangeStart = useMemo(() => {
    if (view === "day") return selectedDay;
    return toISODate(anchor);
  }, [anchor, selectedDay, view]);
  const days = useMemo(() => eachDay(rangeStart, dayCount), [dayCount, rangeStart]);
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

  function shift(direction: number) {
    if (view === "day") {
      setSelectedDay((current) => addDays(current, direction));
      return;
    }
    const step = view === "overview" ? 28 : 7;
    setAnchor((current) => {
      const next = new Date(current);
      next.setDate(next.getDate() + direction * step);
      return startOfWeekMonday(next);
    });
  }

  return (
    <section className="space-y-4">
      <WelcomeBanner />
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-serif text-3xl text-stone-900">Planning équipe</h2>
          <p className="mt-1 text-sm text-stone-600">
            Une ligne par personne, chaque jour en matin / après-midi. Le
            thermolaquage sous-traité a sa propre ligne.
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
                  if (id !== "day") {
                    setAnchor(startOfWeekMonday(anchor));
                  }
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
              onClick={() => {
                const today = startOfWeekMonday(new Date());
                setAnchor(today);
                setSelectedDay(toISODate(new Date()));
              }}
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
          </div>
        </div>
      </div>

      {error && (
        <p className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      )}
      {loading ? (
        <p className="text-sm text-stone-500">Chargement du planning…</p>
      ) : (
      <>
      <div className="flex flex-wrap gap-2">
        {snapshot.chantiers.map((chantier) => {
          const color = colorForChantier(chantier.id);
          const inView = chantiersInView.some((item) => item.id === chantier.id);
          return (
            <span
              key={chantier.id}
              className={`inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-xs text-stone-700 ${
                inView
                  ? "border-stone-200 bg-white"
                  : "border-dashed border-stone-300 bg-stone-50"
              }`}
            >
              <span
                className="h-2.5 w-2.5 rounded-full"
                style={{ backgroundColor: color.bg }}
              />
              {chantier.nom_client}
              <span className="text-stone-400">
                {PRIORITE_LABELS[chantier.priorite]}
                {inView ? "" : " · hors période visible"}
              </span>
            </span>
          );
        })}
      </div>

      {view === "day" ? (
        <DayDetail
          iso={selectedDay}
          snapshot={snapshot}
          onSelectDay={setSelectedDay}
          onOpenPhase={setSelectedPhaseId}
          onAbsence={setAbsenceEmployee}
        />
      ) : (
        <div className="overflow-auto rounded-lg border border-stone-300 bg-white shadow-sm">
          <table className="min-w-full border-collapse text-sm">
            <thead>
              <tr className="bg-stone-100">
                <th className="sticky left-0 z-10 min-w-[160px] border-b border-r border-stone-300 bg-stone-100 px-3 py-2 text-left font-medium">
                  Équipe
                </th>
                {days.map((iso) => {
                  const header = formatDayHeader(iso);
                  const selected = iso === selectedDay;
                  return (
                    <th
                      key={iso}
                      colSpan={2}
                      className={`min-w-[110px] border-b border-l border-stone-300 px-1 py-2 text-center ${
                        isSunday(iso) ? "bg-stone-50 text-stone-400" : ""
                      } ${selected ? "bg-amber-50" : ""}`}
                    >
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedDay(iso);
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
                    className="border-b border-l border-stone-200 px-1 py-1 font-normal"
                  >
                    Matin
                  </th>,
                  <th
                    key={`${iso}-pm`}
                    className="border-b border-l border-stone-200 px-1 py-1 font-normal"
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
                      return (
                      <td
                        key={`${row.id}-${iso}-${slot}`}
                        className={`h-16 border-b border-l border-stone-200 p-1 ${
                          isSunday(iso) || slotOff
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
                              onOpen={setSelectedPhaseId}
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
  snapshot,
  onSelectDay,
  onOpenPhase,
  onAbsence,
}: {
  iso: string;
  snapshot: ReturnType<typeof usePlanning>["snapshot"];
  onSelectDay: (iso: string) => void;
  onOpenPhase: (phaseId: string) => void;
  onAbsence: (employee: Employee) => void;
}) {
  const rows = planningRows(snapshot.employees);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-serif text-2xl capitalize text-stone-900">
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
              className="grid grid-cols-[200px_1fr] border-b border-stone-200 last:border-b-0"
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
                              className="absolute top-1 h-[56px] overflow-hidden rounded px-1.5 py-0.5 text-left text-[11px] leading-tight"
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
  onOpen,
}: {
  assignment: CalendarAssignment;
  compact?: boolean;
  onOpen: (phaseId: string) => void;
}) {
  return (
    <button
      type="button"
      className="block w-full text-left"
      onClick={() => onOpen(assignment.phase.id)}
    >
      <AssignmentChip assignment={assignment} compact={compact} />
    </button>
  );
}
