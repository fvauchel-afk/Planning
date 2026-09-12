"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ChantierEditModal } from "@/components/ChantierEditModal";
import {
  STATUT_CHANTIER_COLORS,
  STATUT_CHANTIER_LABELS,
  chantierPlanningInfo,
} from "@/lib/chantier-status";
import { usePlanning } from "@/lib/planning-context";
import { PRIORITE_LABELS, type Chantier } from "@/lib/types";

export function ChantiersPage() {
  const { snapshot, loading } = usePlanning();
  const [editing, setEditing] = useState<Chantier | null>(null);

  const rows = useMemo(() => {
    return [...snapshot.chantiers]
      .map((chantier) => ({
        chantier,
        info: chantierPlanningInfo(snapshot, chantier.id),
      }))
      .sort((left, right) =>
        left.chantier.nom_client.localeCompare(right.chantier.nom_client, "fr"),
      );
  }, [snapshot]);

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-serif text-3xl text-stone-900">Chantiers</h2>
          <p className="mt-1 text-sm text-stone-600">
            Consultez et modifiez les fiches. Un chantier non planifié peut être
            daté depuis le formulaire d’édition.
          </p>
        </div>
        <Link
          href="/chantiers/nouveau"
          className="rounded-lg bg-amber-700 px-3 py-2 text-sm font-medium text-amber-50"
        >
          Nouveau chantier
        </Link>
      </div>

      {loading ? (
        <p className="text-sm text-stone-500">Chargement…</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-stone-600">Aucun chantier pour le moment.</p>
      ) : (
        <div className="overflow-hidden rounded-lg border border-stone-300 bg-white">
          <table className="min-w-full text-sm">
            <thead className="bg-stone-100 text-left">
              <tr>
                <th className="px-3 py-2 font-medium">Nom</th>
                <th className="px-3 py-2 font-medium">Adresse</th>
                <th className="px-3 py-2 font-medium">Priorité</th>
                <th className="px-3 py-2 font-medium">Statut</th>
                <th className="px-3 py-2 font-medium">Dates</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ chantier, info }) => {
                const colors = STATUT_CHANTIER_COLORS[info.statut];
                return (
                  <tr
                    key={chantier.id}
                    className="cursor-pointer border-t border-stone-200 hover:bg-amber-50/60"
                    onClick={() => setEditing(chantier)}
                  >
                    <td className="px-3 py-2 font-medium text-stone-900">
                      {chantier.nom_client}
                    </td>
                    <td className="px-3 py-2 text-stone-600">
                      {chantier.adresse || "—"}
                    </td>
                    <td className="px-3 py-2">
                      {PRIORITE_LABELS[chantier.priorite]}
                    </td>
                    <td className="px-3 py-2">
                      <span
                        className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs ${colors.tint} ${colors.text}`}
                      >
                        <span
                          className="h-2 w-2 rounded-full"
                          style={{ backgroundColor: colors.dot }}
                        />
                        {STATUT_CHANTIER_LABELS[info.statut]}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-stone-600">
                      {info.rangeLabel ? (
                        <span className="inline-flex flex-wrap items-center gap-1.5">
                          <span className={info.estimatif ? "italic text-violet-800" : ""}>
                            {info.rangeLabel}
                          </span>
                          {info.estimatif ? (
                            <span className="rounded border border-dashed border-violet-400 bg-violet-50 px-1.5 py-px text-[10px] font-semibold uppercase tracking-wide text-violet-800">
                              Estimatif
                            </span>
                          ) : null}
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {editing && (
        <ChantierEditModal
          chantier={editing}
          onClose={() => setEditing(null)}
        />
      )}
    </section>
  );
}
