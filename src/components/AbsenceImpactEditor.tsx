"use client";

import { formatLongDate } from "@/lib/dates";
import type { AbsencePhaseChoice, ImpactedPhaseView } from "@/lib/engine/absence-imprevue";
import { PHASE_LABELS, type Employee } from "@/lib/types";

export function AbsenceImpactEditor({
  impacted,
  candidates,
  choices,
  onChange,
}: {
  impacted: ImpactedPhaseView[];
  candidates: Record<string, Employee[]>;
  choices: Record<string, AbsencePhaseChoice>;
  onChange: (next: Record<string, AbsencePhaseChoice>) => void;
}) {
  if (impacted.length === 0) {
    return (
      <p className="rounded border border-stone-200 bg-stone-50 px-3 py-2 text-sm text-stone-600">
        Aucune tâche planifiée sur cette période. L’absence sera simplement
        enregistrée.
      </p>
    );
  }

  return (
    <ul className="space-y-3">
      {impacted.map((row) => {
        const list = candidates[row.phase.id] ?? [];
        const choice = choices[row.phase.id] ?? { action: "delay" };
        const selectedId = choice.employeeId ?? list[0]?.id ?? "";
        return (
          <li
            key={row.phase.id}
            className="rounded-lg border border-stone-200 p-3 text-sm"
          >
            <p className="font-medium">
              {row.nom_client} — {row.nom_element} ·{" "}
              {PHASE_LABELS[row.phase.type_phase]}
            </p>
            <p className="text-xs text-stone-500">
              {row.phase.date_debut
                ? `${formatLongDate(row.phase.date_debut)} → ${formatLongDate(row.phase.date_fin ?? row.phase.date_debut)}`
                : "Dates non posées"}
            </p>
            <div className="mt-2 space-y-2">
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  name={`res-${row.phase.id}`}
                  checked={choice.action === "delay"}
                  onChange={() =>
                    onChange({
                      ...choices,
                      [row.phase.id]: { action: "delay" },
                    })
                  }
                />
                Décaler
              </label>
              {list.length > 0 ? (
                <label className="flex flex-wrap items-center gap-2">
                  <input
                    type="radio"
                    name={`res-${row.phase.id}`}
                    checked={choice.action === "reassign"}
                    onChange={() =>
                      onChange({
                        ...choices,
                        [row.phase.id]: {
                          action: "reassign",
                          employeeId: selectedId || list[0]!.id,
                        },
                      })
                    }
                  />
                  <span>Réassigner à</span>
                  <select
                    className="min-w-[12rem] rounded border border-stone-300 px-2 py-1"
                    value={selectedId}
                    onChange={(event) =>
                      onChange({
                        ...choices,
                        [row.phase.id]: {
                          action: "reassign",
                          employeeId: event.target.value,
                        },
                      })
                    }
                  >
                    {list.map((item, index) => (
                      <option key={item.id} value={item.id}>
                        {item.nom}
                        {index === 0 ? " (moins chargé cette semaine)" : ""}
                      </option>
                    ))}
                  </select>
                </label>
              ) : (
                <p className="text-xs text-amber-800">
                  Aucune réassignation possible (personne de même rôle libre
                  sur ce créneau). Seul le décalage est proposé.
                </p>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
