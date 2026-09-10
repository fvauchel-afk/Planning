"use client";

import { useMemo, useState } from "react";
import { formatLongDate } from "@/lib/dates";
import type { OvertimeFit, SlotConflict } from "@/lib/engine/planner";
import { PHASE_LABELS } from "@/lib/types";

function alternativeLabel(
  conflict: SlotConflict,
  employeeId: string,
): string {
  const item = conflict.alternatives.find((alt) => alt.employeeId === employeeId);
  if (!item) return employeeId;
  const firstFree = conflict.alternatives.find((alt) => alt.freeOnSlot);
  if (item.freeOnSlot) {
    const light =
      firstFree?.employeeId === item.employeeId
        ? " (moins chargé cette semaine)"
        : "";
    return `${item.nom} — libre sur ce créneau${light}`;
  }
  const from = item.availableFrom
    ? `Disponible dès le ${formatLongDate(item.availableFrom)}`
    : "Pas de créneau proche";
  return `${item.nom} — ${from}${item.impact ? ` — ${item.impact}` : ""}`;
}

export function PlacementConflictPanel({
  conflict,
  onUseSlot,
  onReassign,
  onOvertime,
  onMarkUrgent,
}: {
  conflict: SlotConflict;
  onUseSlot: () => void;
  onReassign: (
    employeeId: string,
    dates: { date_debut: string; date_fin: string } | null,
  ) => void;
  onOvertime: (fit: OvertimeFit) => void;
  onMarkUrgent: () => void;
}) {
  const options = useMemo(() => {
    const rows: { value: string; label: string }[] = [];
    if (conflict.overtime) {
      rows.push({
        value: "overtime",
        label: `Forcer avec heures supplémentaires (${conflict.overtime.label}, ${formatLongDate(conflict.overtime.date_debut)} → ${formatLongDate(conflict.overtime.date_fin)})`,
      });
    }
    for (const item of conflict.alternatives) {
      rows.push({
        value: `reassign:${item.employeeId}`,
        label: alternativeLabel(conflict, item.employeeId),
      });
    }
    return rows;
  }, [conflict]);

  const [choice, setChoice] = useState(options[0]?.value ?? "");

  return (
    <div className="space-y-3 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950">
      <p className="font-medium">
        Conflit de placement — {conflict.nom_element} ·{" "}
        {PHASE_LABELS[conflict.type_phase]}
      </p>
      <p>{conflict.message}</p>

      {conflict.nextFree ? (
        <div className="rounded border border-amber-200 bg-white p-3">
          <p>
            Prochain créneau libre pour la même personne :{" "}
            <strong>
              {formatLongDate(conflict.nextFree.date_debut)} →{" "}
              {formatLongDate(conflict.nextFree.date_fin)}
            </strong>
          </p>
          <button
            type="button"
            className="mt-2 rounded bg-stone-900 px-3 py-1.5 text-sm text-white"
            onClick={onUseSlot}
          >
            Utiliser ce créneau
          </button>
        </div>
      ) : (
        <p>Aucun créneau libre assez long n’a été trouvé pour cette personne.</p>
      )}

      {options.length > 0 && (
        <div className="rounded border border-amber-200 bg-white p-3">
          <label className="block font-medium">
            Réassigner ou forcer le créneau court
            <select
              className="mt-2 w-full rounded border border-stone-300 px-2 py-1.5 font-normal"
              value={choice}
              onChange={(event) => setChoice(event.target.value)}
            >
              {options.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className="mt-2 rounded border border-stone-300 bg-white px-3 py-1.5 text-sm"
            onClick={() => {
              if (choice === "overtime" && conflict.overtime) {
                onOvertime(conflict.overtime);
                return;
              }
              if (choice.startsWith("reassign:")) {
                const employeeId = choice.slice("reassign:".length);
                const item = conflict.alternatives.find(
                  (alt) => alt.employeeId === employeeId,
                );
                if (!item) return;
                onReassign(
                  item.employeeId,
                  item.freeOnSlot
                    ? {
                        date_debut: conflict.date_debut,
                        date_fin: conflict.date_fin,
                      }
                    : item.nextWindow,
                );
              }
            }}
          >
            Appliquer
          </button>
        </div>
      )}

      <button
        type="button"
        className="rounded border border-amber-700 bg-amber-700 px-3 py-1.5 text-sm text-amber-50"
        onClick={onMarkUrgent}
      >
        Marquer ce chantier comme urgent
      </button>
      <p className="text-xs text-amber-900">
        Relance le placement en urgence (fenêtre de décalage des chantiers déjà
        en place, à valider). Les heures supplémentaires ne s’appliquent que si
        vous les choisissez explicitement.
      </p>
    </div>
  );
}
