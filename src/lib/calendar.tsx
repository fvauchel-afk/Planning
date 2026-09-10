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
  const active = employees.filter((employee) => employee.actif);
  return [
    ...active.map((employee) => ({
      id: employee.id,
      label: employee.nom,
      subtitle: employee.roles.join(" · "),
      employee,
    })),
    {
      id: LOGISTIQUE_ROW_ID,
      label: "Logistique",
      subtitle: "sous-traitance",
      employee: null,
    },
  ];
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

export function assignmentsForDay(
  snapshot: PlanningSnapshot,
  rowId: string,
  iso: string,
): CalendarAssignment[] {
  return assignmentIndex(snapshot).byDay.get(dayKey(rowId, iso)) ?? [];
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
  return (
    <div
      className={`overflow-hidden rounded px-1.5 py-0.5 ${compact ? "text-[10px] leading-tight" : "text-xs"}`}
      style={{ backgroundColor: color.bg, color: color.fg }}
      title={`${assignment.chantier.nom_client} — ${assignment.element.nom_element} (${PHASE_LABELS[assignment.phase.type_phase]})`}
    >
      <span className="font-semibold">{assignment.chantier.nom_client}</span>
      {!compact && (
        <span className="opacity-90">
          {" "}
          · {assignment.element.nom_element}
        </span>
      )}
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
