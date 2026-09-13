"use client";

import { PHASE_LABELS } from "@/lib/types";
import { formatLongDate } from "@/lib/dates";
import type { SignalementProposition } from "@/lib/types";

export function PropositionImpact({
  proposition,
}: {
  proposition: SignalementProposition;
}) {
  if (!proposition.repercussions.length && !proposition.message) return null;
  return (
    <div className="mt-2 rounded border border-violet-200 bg-violet-50/70 px-3 py-2 text-sm text-violet-950">
      {proposition.message ? (
        <p className="font-medium">{proposition.message}</p>
      ) : null}
      {proposition.createChantier ? (
        <p className="mt-1 text-xs">
          Création du chantier « {proposition.createChantier.nom_client} » après
          validation.
        </p>
      ) : null}
      {proposition.repercussions.length > 0 ? (
        <ul className="mt-2 space-y-1 text-xs">
          {proposition.repercussions.map((row) => (
            <li key={row.phase_id}>
              <span className="font-medium">{row.nom_client}</span>
              {" · "}
              {row.nom_salarie}
              {" · "}
              {PHASE_LABELS[row.type_phase]} : {formatLongDate(row.old_debut)} →{" "}
              {formatLongDate(row.old_fin)} devient {formatLongDate(row.date_debut)}{" "}
              → {formatLongDate(row.date_fin)}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-1 text-xs">Aucune autre affaire déplacée.</p>
      )}
    </div>
  );
}
