"use client";

import { PHASE_LABELS, PRIORITE_LABELS } from "@/lib/types";
import { formatLongDate } from "@/lib/dates";
import type { Displacement, PlannedPhase } from "@/lib/engine/planner";

export function ConflictModal({
  message,
  displacements,
  incoming,
  title = "Conflit d’urgence",
  incomingLabel = "Placement du chantier urgent",
  adjustLabel = "Ajuster (placer à la suite, sans décaler)",
  validateLabel = "Valider les décalages",
  showIncoming = true,
  onValidate,
  onAdjust,
  onCancel,
}: {
  message: string;
  displacements: Displacement[];
  incoming: PlannedPhase[];
  title?: string;
  incomingLabel?: string;
  adjustLabel?: string;
  validateLabel?: string;
  showIncoming?: boolean;
  onValidate: () => void;
  onAdjust: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/50 p-4">
      <div className="max-h-[90vh] w-full max-w-2xl overflow-auto rounded-lg border border-stone-300 bg-white p-5 shadow-xl">
        <h3 className="font-serif text-2xl text-stone-900">{title}</h3>
        <p className="mt-2 text-sm text-stone-600">{message}</p>

        <div className="mt-4 space-y-3">
          <h4 className="text-sm font-medium">Décalages proposés</h4>
          {displacements.length === 0 && (
            <p className="text-sm text-stone-500">Aucun décalage autorisé.</p>
          )}
          {displacements.map((item) => (
            <div
              key={item.chantier_id}
              className="rounded border border-stone-200 bg-stone-50 p-3 text-sm"
            >
              <p className="font-medium">
                {item.nom_client}{" "}
                <span className="font-normal text-stone-500">
                  ({PRIORITE_LABELS[item.priorite]}) · +{item.working_days} jour
                  {item.working_days > 1 ? "s" : ""} ouvré
                  {item.working_days > 1 ? "s" : ""}
                </span>
              </p>
              <ul className="mt-1 space-y-0.5 text-stone-600">
                {item.phases.map((phase) => (
                  <li key={phase.phase_id}>
                    {PHASE_LABELS[phase.type_phase]} :{" "}
                    {formatLongDate(phase.old_debut)} → {formatLongDate(phase.old_fin)}{" "}
                    devient {formatLongDate(phase.date_debut)} →{" "}
                    {formatLongDate(phase.date_fin)}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {showIncoming && (
        <div className="mt-4 rounded border border-amber-200 bg-amber-50 p-3 text-sm">
          <p className="font-medium text-amber-950">{incomingLabel}</p>
          <ul className="mt-1 text-amber-900">
            {incoming
              .filter((phase) => phase.date_debut)
              .map((phase) => (
                <li key={`${phase.elementIndex}-${phase.type_phase}`}>
                  {phase.nom_element} · {PHASE_LABELS[phase.type_phase]} :{" "}
                  {formatLongDate(phase.date_debut!)} → {formatLongDate(phase.date_fin!)}
                </li>
              ))}
          </ul>
        </div>
        )}

        <div className="mt-5 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={onValidate}
            className="rounded bg-amber-700 px-3 py-2 text-sm text-amber-50"
          >
            {validateLabel}
          </button>
          <button
            type="button"
            onClick={onAdjust}
            className="rounded border border-stone-300 bg-white px-3 py-2 text-sm"
          >
            {adjustLabel}
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="rounded px-3 py-2 text-sm text-stone-600"
          >
            Annuler
          </button>
        </div>
      </div>
    </div>
  );
}
