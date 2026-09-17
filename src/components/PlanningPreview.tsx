"use client";

import { addDays, eachDayInclusive, formatDisplayedDay, isSunday, parisCalendarYmd } from "@/lib/dates";
import {
  assignmentsForDay,
  planningRows,
  uniqueAssignmentsByChantier,
} from "@/lib/calendar";
import { colorForChantier } from "@/lib/colors";
import { previewSolutionSnapshot } from "@/lib/engine/preview-solution";
import { LOGISTIQUE_ROW_ID, TRANSPORT_ROW_ID, type PlanningSnapshot, type PlanningSolution } from "@/lib/types";

function previewWindow(snapshot: PlanningSnapshot, solution: PlanningSolution): string[] {
  const dates = solution.repercussions.flatMap((row) => [
    row.old_debut,
    row.old_fin,
    row.date_debut,
    row.date_fin,
  ]);
  if (solution.createChantier) {
    for (const element of solution.createChantier.elements) {
      for (const phase of element.phases) {
        if (phase.date_debut) dates.push(phase.date_debut);
        if (phase.date_fin) dates.push(phase.date_fin);
      }
    }
  }
  const sorted = dates.filter(Boolean).sort();
  if (!sorted.length) {
    const fallback = snapshot.phases
      .map((phase) => phase.date_debut)
      .filter((value): value is string => Boolean(value))
      .sort();
    const start = fallback[0] ?? parisCalendarYmd();
    return eachDayInclusive(start, addDays(start, 13)).filter((day) => !isSunday(day));
  }
  const start = addDays(sorted[0], -2);
  const end = addDays(sorted[sorted.length - 1], 2);
  return eachDayInclusive(start, end).filter((day) => !isSunday(day)).slice(0, 16);
}

export function PlanningPreview({
  snapshot,
  solution,
}: {
  snapshot: PlanningSnapshot;
  solution: PlanningSolution;
}) {
  const preview = previewSolutionSnapshot(snapshot, solution);
  const days = previewWindow(snapshot, solution);
  const moved = new Set(solution.repercussions.map((row) => row.phase_id));
  const employeeIds = new Set(
    solution.repercussions
      .map((row) => {
        const phase = preview.phases.find((item) => item.id === row.phase_id);
        return phase?.employe_id;
      })
      .filter((id): id is string => Boolean(id)),
  );
  if (solution.createChantier) {
    for (const element of solution.createChantier.elements) {
      for (const phase of element.phases) {
        if (phase.employe_id) employeeIds.add(phase.employe_id);
      }
    }
  }
  const rows = planningRows(preview.employees).filter(
    (row) =>
      row.id === LOGISTIQUE_ROW_ID ||
      row.id === TRANSPORT_ROW_ID ||
      employeeIds.has(row.id) ||
      employeeIds.size === 0,
  ).slice(0, 9);

  return (
    <div className="mt-2 overflow-x-auto rounded border border-stone-200 bg-white">
      <table className="min-w-full border-collapse text-[10px]">
        <thead>
          <tr>
            <th className="sticky left-0 bg-stone-50 px-1 py-1 text-left font-medium">
              Salarié
            </th>
            {days.map((day) => (
              <th key={day} className="px-1 py-1 font-normal text-stone-500">
                {formatDisplayedDay(day)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id} className="border-t border-stone-100">
              <td className="sticky left-0 max-w-[88px] truncate bg-white px-1 py-1 font-medium">
                {row.label}
              </td>
              {days.map((day) => {
                const assignments = uniqueAssignmentsByChantier(
                  assignmentsForDay(preview, row.id, day),
                );
                return (
                  <td key={day} className="px-0.5 py-0.5 align-top">
                    {assignments.map((item) => {
                      const color = colorForChantier(item.chantier.id);
                      const highlighted =
                        moved.has(item.phase.id) ||
                        item.chantier.id === "preview-chantier";
                      return (
                        <div
                          key={item.phase.id}
                          className={`mb-0.5 truncate rounded px-1 leading-4 ${
                            highlighted ? "ring-1 ring-violet-700" : ""
                          }`}
                          style={{
                            background: color.bg,
                            color: color.fg,
                          }}
                          title={`${item.chantier.nom_client} · ${item.element.nom_element}`}
                        >
                          {item.chantier.nom_client}
                        </div>
                      );
                    })}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
