"use client";

import { MobileShell } from "@/components/MobileShell";
import { PiecesJointesListe } from "@/components/PiecesJointesListe";
import { formatLongDate } from "@/lib/dates";
import { formatCreneauCourt } from "@/lib/absence-creneau";
import { idsEqual } from "@/lib/auth/ids";
import { usePlanning } from "@/lib/planning-context";
import { useSession } from "@/lib/auth/session-context";
import {
  ABSENCE_LABELS,
  STATUT_DEMANDE_LABELS,
} from "@/lib/types";

function statusClass(statut: string) {
  if (statut === "acceptee") return "bg-green-100 text-green-800";
  if (statut === "refusee") return "bg-red-100 text-red-900";
  return "bg-amber-100 text-amber-900";
}

export function MesCongesPage() {
  const { snapshot, loading } = usePlanning();
  const { session } = useSession();
  const rows = [...(snapshot.demandes ?? [])]
    .filter(
      (row) =>
        row.categorie === "conge" &&
        idsEqual(row.employe_id, session?.employeeId ?? ""),
    )
    .sort(
      (left, right) =>
        Date.parse(right.date_creation) - Date.parse(left.date_creation),
    );

  return (
    <MobileShell>
      <h2 className="font-serif text-2xl text-stone-900">Mes congés</h2>
      <p className="mt-1 mb-4 text-sm text-stone-600">
        Demandes envoyées depuis la bulle. Une demande en attente n’apparaît pas
        encore sur le planning.
      </p>
      {loading ? (
        <p className="text-sm text-stone-500">Chargement…</p>
      ) : rows.length === 0 ? (
        <p className="rounded-lg border border-stone-200 bg-white px-4 py-6 text-sm text-stone-500">
          Aucune demande de congé pour le moment.
        </p>
      ) : (
        <ul className="space-y-3">
          {rows.map((demande) => {
            const type = demande.type_absence
              ? ABSENCE_LABELS[demande.type_absence]
              : "Congé";
            return (
              <li
                key={demande.id}
                className="rounded-lg border border-stone-200 bg-white px-4 py-3 shadow-sm"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-medium text-stone-900">{type}</p>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${statusClass(
                      demande.statut,
                    )}`}
                  >
                    {STATUT_DEMANDE_LABELS[demande.statut]}
                  </span>
                </div>
                <p className="mt-1 text-sm text-stone-700">
                  {demande.date_debut
                    ? formatLongDate(demande.date_debut)
                    : "—"}
                  {demande.date_fin &&
                  demande.date_fin !== demande.date_debut
                    ? ` → ${formatLongDate(demande.date_fin)}`
                    : ""}
                  {formatCreneauCourt(demande)
                    ? ` · ${formatCreneauCourt(demande)}`
                    : ""}
                </p>
                {demande.motif_precision?.trim() ? (
                  <p className="mt-1 text-sm text-stone-600">
                    {demande.motif_precision.trim()}
                  </p>
                ) : null}
                <PiecesJointesListe pieces={demande.photos} />
                {demande.statut === "refusee" && demande.motif_refus?.trim() ? (
                  <p className="mt-2 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900">
                    Motif : {demande.motif_refus.trim()}
                  </p>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </MobileShell>
  );
}
