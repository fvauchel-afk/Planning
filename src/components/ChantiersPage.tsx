"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ChantierEditModal } from "@/components/ChantierEditModal";
import {
  STATUT_CHANTIER_COLORS,
  STATUT_CHANTIER_LABELS,
  chantierPlanningInfo,
} from "@/lib/chantier-status";
import { usePlanning } from "@/lib/planning-context";
import { useFormDraftReopen } from "@/lib/form-draft";
import { PRIORITE_LABELS, type Chantier } from "@/lib/types";
import {
  formatChantierCreatedAt,
  formatChantierCreatedBy,
} from "@/lib/chantier-origine";
import {
  hasPendingSignalements,
  PENDING_CHANTIER_MESSAGE,
} from "@/lib/signalements";

export function ChantiersPage() {
  const { snapshot, loading } = usePlanning();
  const { reopen, clearReopen } = useFormDraftReopen();
  const [editing, setEditing] = useState<Chantier | null>(null);
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function openFiche(chantier: Chantier) {
    setEditing(chantier);
    router.replace(`${pathname}?fiche=${encodeURIComponent(chantier.id)}`, {
      scroll: false,
    });
  }

  function closeFiche() {
    setEditing(null);
    router.replace(pathname, { scroll: false });
  }

  useEffect(() => {
    if (reopen?.kind !== "chantier") return;
    if (loading) return;
    const found = snapshot.chantiers.find((item) => item.id === reopen.id);
    if (found) openFiche(found);
    clearReopen();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reopen, loading, snapshot.chantiers, clearReopen]);

  useEffect(() => {
    const fiche = searchParams.get("fiche");
    if (!fiche || loading) return;
    const found = snapshot.chantiers.find((item) => item.id === fiche);
    if (found) setEditing(found);
  }, [searchParams, loading, snapshot.chantiers]);
  const pendingBlock = hasPendingSignalements(snapshot);

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
        {pendingBlock ? (
          <p
            className="max-w-sm rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-950"
            title={PENDING_CHANTIER_MESSAGE}
          >
            {PENDING_CHANTIER_MESSAGE}{" "}
            <Link href="/signalements" className="font-medium underline">
              Ouvrir les signalements
            </Link>
          </p>
        ) : (
          <Link
            href="/chantiers/nouveau"
            className="rounded-lg bg-amber-700 px-3 py-2 text-sm font-medium text-amber-50"
          >
            Nouveau chantier
          </Link>
        )}
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
                <th className="px-3 py-2 font-medium">Créé par</th>
                <th className="px-3 py-2 font-medium">Créé le</th>
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
                    onClick={() => openFiche(chantier)}
                  >
                    <td className="px-3 py-2 font-medium text-stone-900">
                      {chantier.nom_client}
                    </td>
                    <td className="px-3 py-2 text-stone-600">
                      {formatChantierCreatedBy(chantier)}
                    </td>
                    <td className="px-3 py-2 text-stone-600">
                      {formatChantierCreatedAt(chantier) || "—"}
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
                      <span className="inline-flex flex-wrap items-center gap-1.5">
                        {info.rangeLabel ? (
                          <span className={info.estimatif ? "italic text-violet-800" : ""}>
                            {info.rangeLabel}
                          </span>
                        ) : (
                          <span>—</span>
                        )}
                        {info.estimatif ? (
                          <span className="rounded border border-dashed border-violet-400 bg-violet-50 px-1.5 py-px text-[10px] font-semibold uppercase tracking-wide text-violet-800">
                            Estimatif
                          </span>
                        ) : null}
                        <span
                          className={`rounded border px-1.5 py-px text-[10px] font-semibold uppercase tracking-wide ${
                            chantier.plan_valide
                              ? "border-emerald-400 bg-emerald-50 text-emerald-800"
                              : "border-dashed border-violet-400 bg-violet-50 text-violet-800"
                          }`}
                        >
                          {chantier.plan_valide ? "Plan validé" : "Plan à faire"}
                        </span>
                      </span>
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
          onClose={closeFiche}
        />
      )}
    </section>
  );
}
