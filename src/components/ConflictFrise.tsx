"use client";

import {
  calendarDaysBetween,
  eachDayInclusive,
  formatDayHeader,
} from "@/lib/dates";
import type { Displacement, PlannedPhase } from "@/lib/engine/planner";

type FriseRow = {
  id: string;
  label: string;
  oldStart: string | null;
  oldEnd: string | null;
  newStart: string | null;
  newEnd: string | null;
  incoming: boolean;
};

function minMax(dates: string[]): { start: string; end: string } | null {
  if (dates.length === 0) return null;
  let start = dates[0]!;
  let end = dates[0]!;
  for (const iso of dates) {
    if (iso < start) start = iso;
    if (iso > end) end = iso;
  }
  return { start, end };
}

function displacementSpan(item: Displacement, key: "old" | "new") {
  const dates: string[] = [];
  for (const phase of item.phases) {
    if (key === "old") {
      dates.push(phase.old_debut.slice(0, 10), phase.old_fin.slice(0, 10));
    } else {
      dates.push(phase.date_debut.slice(0, 10), phase.date_fin.slice(0, 10));
    }
  }
  return minMax(dates);
}

function incomingSpan(incoming: PlannedPhase[]) {
  const dates = incoming.flatMap((phase) =>
    [phase.date_debut, phase.date_fin].filter(Boolean).map((iso) => iso!.slice(0, 10)),
  );
  return minMax(dates);
}

function barStyle(start: string, end: string, axisStart: string, days: number) {
  const left = (calendarDaysBetween(axisStart, start) / days) * 100;
  const width = ((calendarDaysBetween(start, end) + 1) / days) * 100;
  return {
    left: `${Math.max(0, left)}%`,
    width: `${Math.max(2.5, width)}%`,
  };
}

export function ConflictFrise({
  displacements,
  incoming,
  showIncoming,
}: {
  displacements: Displacement[];
  incoming: PlannedPhase[];
  showIncoming?: boolean;
}) {
  const rows: FriseRow[] = [];
  if (showIncoming) {
    const span = incomingSpan(incoming);
    if (span) {
      rows.push({
        id: "incoming",
        label: "Nouveau / urgent",
        oldStart: null,
        oldEnd: null,
        newStart: span.start,
        newEnd: span.end,
        incoming: true,
      });
    }
  }
  for (const item of displacements) {
    const before = displacementSpan(item, "old");
    const after = displacementSpan(item, "new");
    if (!before && !after) continue;
    rows.push({
      id: item.chantier_id,
      label: item.nom_client,
      oldStart: before?.start ?? null,
      oldEnd: before?.end ?? null,
      newStart: after?.start ?? null,
      newEnd: after?.end ?? null,
      incoming: false,
    });
  }

  const axisDates = rows.flatMap((row) =>
    [row.oldStart, row.oldEnd, row.newStart, row.newEnd].filter(
      (iso): iso is string => Boolean(iso),
    ),
  );
  const axis = minMax(axisDates);
  if (!axis || rows.length === 0) return null;
  const daysList = eachDayInclusive(axis.start, axis.end);
  const days = daysList.length;
  const tickEvery = days > 16 ? Math.ceil(days / 8) : 1;

  return (
    <div className="mt-4 rounded-lg border border-stone-200 bg-white p-3">
      <p className="text-sm font-medium text-stone-800">Vue planning</p>
      <p className="mt-0.5 text-xs text-stone-500">
        Barre claire = avant. Barre colorée = après (proposition). Pas encore de
        glisser : Valider ou Ajuster en bas.
      </p>
      <div className="relative mt-3 overflow-x-auto">
        <div className="mb-1 flex text-[10px] uppercase tracking-wide text-stone-400">
          {daysList.map((iso, index) => (
            <div
              key={iso}
              className="min-w-0 flex-1 text-center"
              style={{ flex: "1 1 0" }}
            >
              {index % tickEvery === 0 || index === daysList.length - 1
                ? formatDayHeader(iso).date
                : ""}
            </div>
          ))}
        </div>
        <div className="space-y-2">
          {rows.map((row) => (
            <div key={row.id}>
              <p className="mb-0.5 truncate text-xs font-medium text-stone-700">
                {row.label}
              </p>
              <div className="relative h-8 rounded bg-stone-100">
                {row.oldStart && row.oldEnd ? (
                  <div
                    className="absolute top-1 h-2.5 rounded bg-stone-300 ring-1 ring-stone-400"
                    style={barStyle(row.oldStart, row.oldEnd, axis.start, days)}
                    title={`Avant : ${row.oldStart} → ${row.oldEnd}`}
                  />
                ) : null}
                {row.newStart && row.newEnd ? (
                  <div
                    className={`absolute bottom-1 h-2.5 rounded ${
                      row.incoming
                        ? "bg-amber-500"
                        : "bg-sky-600"
                    }`}
                    style={barStyle(row.newStart, row.newEnd, axis.start, days)}
                    title={`Après : ${row.newStart} → ${row.newEnd}`}
                  />
                ) : null}
              </div>
            </div>
          ))}
        </div>
      </div>
      <p className="mt-2 text-[11px] text-stone-500">
        <span className="mr-3 inline-block h-2 w-4 rounded bg-stone-300 align-middle" />
        Avant
        <span className="ml-3 mr-1 inline-block h-2 w-4 rounded bg-sky-600 align-middle" />
        Décalé
        <span className="ml-3 mr-1 inline-block h-2 w-4 rounded bg-amber-500 align-middle" />
        Nouveau
      </p>
    </div>
  );
}
