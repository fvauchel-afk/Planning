"use client";

import {
  LOGISTIQUE_ROW_ID,
  PHASE_LABELS,
  absenceLabel,
  type Absence,
  type Chantier,
  type ElementChantier,
  type Employee,
  type PhasePlanning,
  type PlanningSnapshot,
} from "@/lib/types";
import { colorForChantier } from "@/lib/colors";
import { dateInRange, formatOvertimeHours } from "@/lib/dates";
import { phaseIsEstimative, fabricationAwaitingLaunch } from "@/lib/dates-estimatives";
import {
  LOGISTIQUE_ROW_LABEL,
  LOGISTIQUE_ROW_ORDRE,
} from "@/lib/display-order";
import { employeeOrdreForPlanning } from "@/lib/employee-row-order";
import { formatHoursLabel, hoursForSlot } from "@/lib/engine/hours";
import { slotsFromExistingPhase, halfFromLabel, type OccupiedSlot } from "@/lib/engine/slots";

export type CalendarAssignment = {
  phase: PhasePlanning;
  chantier: Chantier;
  element: ElementChantier;
};

type AssignmentIndex = {
  byCell: Map<string, CalendarAssignment[]>;
  byDay: Map<string, CalendarAssignment[]>;
  slotsByPhase: Map<string, OccupiedSlot[]>;
};

const assignmentIndexCache = new WeakMap<PlanningSnapshot, AssignmentIndex>();

function cellKey(rowId: string, date: string, half: 0 | 1): string {
  return `${rowId}|${date}|${half}`;
}

function dayKey(rowId: string, date: string): string {
  return `${rowId}|${date}`;
}

function pushUnique(
  map: Map<string, CalendarAssignment[]>,
  key: string,
  assignment: CalendarAssignment,
) {
  const current = map.get(key) ?? [];
  if (current.some((item) => item.phase.id === assignment.phase.id)) return;
  current.push(assignment);
  map.set(key, current);
}

export function assignmentIndex(snapshot: PlanningSnapshot): AssignmentIndex {
  const cached = assignmentIndexCache.get(snapshot);
  if (cached) return cached;
  const byCell = new Map<string, CalendarAssignment[]>();
  const byDay = new Map<string, CalendarAssignment[]>();
  const slotsByPhase = new Map<string, OccupiedSlot[]>();
  const elementById = new Map(
    snapshot.elements.map((element) => [element.id, element]),
  );
  const chantierById = new Map(
    snapshot.chantiers.map((chantier) => [chantier.id, chantier]),
  );
  for (const phase of snapshot.phases) {
    const slots = slotsFromExistingPhase(snapshot, phase);
    slotsByPhase.set(phase.id, slots);
    const element = elementById.get(phase.element_id);
    if (!element) continue;
    const chantier = chantierById.get(element.chantier_id);
    if (!chantier) continue;
    const assignment = { phase, chantier, element };
    for (const slot of slots) {
      pushUnique(byCell, cellKey(slot.rowId, slot.date, slot.half), assignment);
      pushUnique(byDay, dayKey(slot.rowId, slot.date), assignment);
    }
  }
  const index = { byCell, byDay, slotsByPhase };
  assignmentIndexCache.set(snapshot, index);
  return index;
}

export type CalendarRow = {
  id: string;
  label: string;
  subtitle: string;
  employee: Employee | null;
};

export function planningRows(employees: Employee[]): CalendarRow[] {
  const people = employees
    .filter((employee) => employee.actif)
    .map((employee) => ({
      id: employee.id,
      label: employee.nom,
      subtitle: employee.roles.join(" · "),
      employee,
      ordre: employeeOrdreForPlanning(employee),
    }));
  const rows = [
    ...people,
    {
      id: LOGISTIQUE_ROW_ID,
      label: LOGISTIQUE_ROW_LABEL,
      subtitle: "sous-traitance",
      employee: null,
      ordre: LOGISTIQUE_ROW_ORDRE,
    },
  ];
  rows.sort((left, right) => {
    if (left.ordre !== right.ordre) return left.ordre - right.ordre;
    return left.label.localeCompare(right.label, "fr");
  });
  return rows.map((row) => ({
    id: row.id,
    label: row.label,
    subtitle: row.subtitle,
    employee: row.employee,
  }));
}

export function firstChantierOccurrence(
  snapshot: PlanningSnapshot,
  chantierId: string,
): { rowId: string; date: string; half: 0 | 1 } | null {
  const index = assignmentIndex(snapshot);
  const rowOrder = new Map(
    planningRows(snapshot.employees).map((row, position) => [row.id, position]),
  );
  let best: { rowId: string; date: string; half: 0 | 1; order: number } | null =
    null;
  for (const [key, assignments] of Array.from(index.byCell.entries())) {
    if (!assignments.some((item) => item.chantier.id === chantierId)) continue;
    const [rowId, date, halfRaw] = key.split("|");
    if (!rowId || !date) continue;
    const half = halfRaw === "1" ? 1 : 0;
    const order = rowOrder.get(rowId) ?? 999;
    if (
      !best ||
      date < best.date ||
      (date === best.date && half < best.half) ||
      (date === best.date && half === best.half && order < best.order)
    ) {
      best = { rowId, date, half, order };
    }
  }
  return best ? { rowId: best.rowId, date: best.date, half: best.half } : null;
}

export function assignmentsForCell(
  snapshot: PlanningSnapshot,
  rowId: string,
  iso: string,
  half: "matin" | "apres_midi" = "matin",
): CalendarAssignment[] {
  const wantedHalf = halfFromLabel(half);
  return assignmentIndex(snapshot).byCell.get(cellKey(rowId, iso, wantedHalf)) ?? [];
}

export function uniqueAssignmentsByChantier(
  assignments: CalendarAssignment[],
): CalendarAssignment[] {
  const seen = new Set<string>();
  const unique: CalendarAssignment[] = [];
  for (const assignment of assignments) {
    if (seen.has(assignment.chantier.id)) continue;
    seen.add(assignment.chantier.id);
    unique.push(assignment);
  }
  return unique;
}

export function assignmentsForDay(
  snapshot: PlanningSnapshot,
  rowId: string,
  iso: string,
): CalendarAssignment[] {
  return assignmentIndex(snapshot).byDay.get(dayKey(rowId, iso)) ?? [];
}

/** Heures occupées sur la plage affichée (créneaux matin / après-midi où il y a un bloc). */
export function rowHoursInDays(
  snapshot: PlanningSnapshot,
  rowId: string,
  days: string[],
): number {
  let total = 0;
  for (const iso of days) {
    for (const half of [0, 1] as const) {
      const slot = half === 0 ? "matin" : "apres_midi";
      if (assignmentsForCell(snapshot, rowId, iso, slot).length === 0) continue;
      total += hoursForSlot(snapshot, rowId, iso, half);
    }
  }
  return total;
}

export function chantierVisibleOnGrid(
  snapshot: PlanningSnapshot,
  chantierId: string,
): boolean {
  const index = assignmentIndex(snapshot);
  for (const assignments of Array.from(index.byCell.values())) {
    if (assignments.some((item) => item.chantier.id === chantierId)) return true;
  }
  return false;
}

export function slotsForPhase(
  snapshot: PlanningSnapshot,
  phaseId: string,
): OccupiedSlot[] {
  return assignmentIndex(snapshot).slotsByPhase.get(phaseId) ?? [];
}

export function absencesForCell(
  absences: Absence[],
  employeeId: string | null,
  iso: string,
): Absence[] {
  if (!employeeId) return [];
  return absences.filter(
    (absence) =>
      absence.employe_id === employeeId &&
      dateInRange(iso, absence.date_debut, absence.date_fin),
  );
}

export function AssignmentChip({
  assignment,
  compact,
}: {
  assignment: CalendarAssignment;
  compact?: boolean;
}) {
  const color = colorForChantier(assignment.chantier.id);
  const needsLaunch = fabricationAwaitingLaunch(assignment.phase);
  return (
    <div
      className={`overflow-hidden rounded px-1.5 py-0.5 ${compact ? "text-[10px] leading-tight" : "text-xs"} ${
        needsLaunch ? "ring-2 ring-orange-500" : ""
      }`}
      title={`${assignment.chantier.nom_client} — ${assignment.element.nom_element} (${PHASE_LABELS[assignment.phase.type_phase]}) · ${formatHoursLabel(assignment.phase.duree_estimee_heures)}${
        needsLaunch ? " — à valider" : ""
      }`}
    >
      <span className="font-semibold">{assignment.chantier.nom_client}</span>
      {!compact && (
        <span className="opacity-90">
          {" "}
          · {assignment.element.nom_element}
        </span>
      )}
      {Number(assignment.phase.duree_estimee_heures) > 0 && !compact ? (
        <span className="ml-1 rounded bg-black/35 px-1 text-[11px] font-bold tabular-nums tracking-wide">
          {formatHoursLabel(assignment.phase.duree_estimee_heures)}
        </span>
      ) : null}
      {needsLaunch ? (
        <span
          className={`ml-1 rounded bg-orange-600 px-1 font-semibold uppercase tracking-wide text-orange-50 ${compact ? "text-[8px]" : "text-[9px]"}`}
        >
          ⚠ à valider
        </span>
      ) : phaseIsEstimative(assignment.phase) ? (
        <span
          className={`ml-1 rounded bg-violet-900/80 px-1 font-semibold uppercase tracking-wide text-violet-50 ${compact ? "text-[8px]" : "text-[9px]"}`}
        >
          Estimatif
        </span>
      ) : null}
      {assignment.phase.heures_supplementaires_par_jour ? (
        <span
          className={`ml-1 rounded bg-black/30 px-1 font-semibold ${compact ? "text-[9px]" : "text-[10px]"}`}
        >
          {formatOvertimeHours(assignment.phase.heures_supplementaires_par_jour)}
        </span>
      ) : null}
      {assignment.chantier.lien_dossier_onedrive && (
        <a
          href={assignment.chantier.lien_dossier_onedrive}
          target="_blank"
          rel="noreferrer"
          className={`ml-1 underline decoration-white/60 ${compact ? "text-[9px]" : "text-[10px]"}`}
          onClick={(event) => event.stopPropagation()}
        >
          OneDrive
        </a>
      )}
    </div>
  );
}

export function AbsenceChip({
  absence,
  compact,
}: {
  absence: Absence;
  compact?: boolean;
}) {
  return (
    <div
      className={`rounded border border-stone-400 bg-[repeating-linear-gradient(45deg,#e7e5e4,#e7e5e4_4px,#d6d3d1_4px,#d6d3d1_8px)] px-1.5 py-0.5 text-stone-700 ${compact ? "text-[10px]" : "text-xs"}`}
    >
      {absenceLabel(absence)}
    </div>
  );
}
