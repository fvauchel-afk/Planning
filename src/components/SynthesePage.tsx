"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { devisApi } from "@/lib/devis/client-api";
import { formatLongDate } from "@/lib/dates";
import { TARGET_LOAD, buildSynthesis } from "@/lib/engine/capacity";
import { chosesAEffectuer, tauxAcceptationDevis } from "@/lib/synthese/dashboard";
import type { DevisListe } from "@/lib/devis/types";
import { usePlanning } from "@/lib/planning-context";

const TONE_CLASS = {
  green: "bg-emerald-100 text-emerald-900 border-emerald-300",
  orange: "bg-amber-100 text-amber-950 border-amber-300",
  red: "bg-red-100 text-red-900 border-red-300",
};

const CARD = "rounded-lg border border-stone-200 bg-white p-4";

export function SynthesePage() {
  const { snapshot, loading } = usePlanning();
  const [devis, setDevis] = useState<DevisListe[]>([]);
  const [devisErr, setDevisErr] = useState<string | null>(null);

  useEffect(() => {
    void devisApi<{ rows: DevisListe[] }>("/api/devis")
      .then((data) => {
        setDevis(data.rows ?? []);
        setDevisErr(null);
      })
      .catch((err: unknown) => {
        setDevisErr(err instanceof Error ? err.message : "Lecture des devis impossible.");
      });
  }, []);

  const synthesis = useMemo(
    () =>
      loading
        ? { weeks: [], unplaced: [], target: TARGET_LOAD }
        : buildSynthesis(snapshot, 12),
    [loading, snapshot],
  );
  const acceptation = useMemo(() => tauxAcceptationDevis(devis), [devis]);
  const aFaire = useMemo(() => chosesAEffectuer(snapshot, devis), [snapshot, devis]);
  const semaine = synthesis.weeks[0];

  return (
    <section className="space-y-6">
      <div>
        <h2 className="font-serif text-3xl text-stone-900">Synthèse</h2>
        <p className="mt-1 text-sm text-stone-600">
          Charge atelier, devis, et ce qui attend encore une action. Semaine par semaine :
          vert ≤ 80 %, orange 80–110 %, rouge &gt; 110 %.
        </p>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <div className={CARD}>
          <p className="text-xs font-medium uppercase tracking-wide text-stone-500">Charge semaine</p>
          {semaine ? (
            <>
              <p className="mt-1 text-3xl font-semibold tabular-nums text-stone-900">
                {Math.round(semaine.rate * 100)} %
              </p>
              <p className="mt-1 text-sm text-stone-600">
                {semaine.plannedHours} h / {semaine.capacityHours} h · semaine du{" "}
                {formatLongDate(semaine.weekStart)}
              </p>
            </>
          ) : (
            <p className="mt-2 text-sm text-stone-500">Chargement…</p>
          )}
        </div>
        <div className={CARD}>
          <p className="text-xs font-medium uppercase tracking-wide text-stone-500">
            Taux d’acceptation des devis
          </p>
          {acceptation.taux === null ? (
            <p className="mt-2 text-sm text-stone-600">Aucun devis envoyé.</p>
          ) : (
            <>
              <p className="mt-1 text-3xl font-semibold tabular-nums text-stone-900">
                {Math.round(acceptation.taux * 100)} %
              </p>
              <p className="mt-1 text-sm text-stone-600">
                {acceptation.acceptes} acceptés / {acceptation.envoyes} sortis
                {acceptation.enAttente || acceptation.refuses
                  ? ` (${acceptation.enAttente} en attente, ${acceptation.refuses} refusés)`
                  : ""}
              </p>
            </>
          )}
          {devisErr ? <p className="mt-2 text-xs text-red-800">{devisErr}</p> : null}
        </div>
        <div className={CARD}>
          <p className="text-xs font-medium uppercase tracking-wide text-stone-500">À effectuer</p>
          <p className="mt-1 text-3xl font-semibold tabular-nums text-stone-900">{aFaire.total}</p>
          <p className="mt-1 text-sm text-stone-600">
            {aFaire.total === 0 ? "Rien en attente." : "Somme des files ci-dessous."}
          </p>
        </div>
      </div>

      <div className="overflow-hidden rounded-lg border border-stone-300 bg-white">
        <h3 className="border-b border-stone-200 bg-stone-100 px-3 py-2 font-serif text-lg text-stone-900">
          Détail à effectuer
        </h3>
        <ul className="divide-y divide-stone-200 text-sm">
          {aFaire.lignes.map((ligne) => (
            <li key={ligne.id}>
              <Link href={ligne.href} className="flex items-center justify-between px-3 py-2 hover:bg-stone-50">
                <span>{ligne.label}</span>
                <span className="tabular-nums font-medium text-stone-900">{ligne.count}</span>
              </Link>
            </li>
          ))}
        </ul>
      </div>

      {loading && <p className="text-sm text-stone-500">Chargement…</p>}

      <div className="overflow-hidden rounded-lg border border-stone-300 bg-white">
        <table className="min-w-full text-sm">
          <thead className="bg-stone-100 text-left">
            <tr>
              <th className="px-3 py-2 font-medium">Semaine</th>
              <th className="px-3 py-2 font-medium">Planifié</th>
              <th className="px-3 py-2 font-medium">Capacité</th>
              <th className="px-3 py-2 font-medium">Charge</th>
            </tr>
          </thead>
          <tbody>
            {synthesis.weeks.map((week) => (
              <tr key={week.weekStart} className="border-t border-stone-200">
                <td className="px-3 py-2">Semaine du {formatLongDate(week.weekStart)}</td>
                <td className="px-3 py-2">{week.plannedHours} h</td>
                <td className="px-3 py-2">{week.capacityHours} h</td>
                <td className="px-3 py-2">
                  <span
                    className={`inline-flex rounded border px-2 py-0.5 text-xs font-medium ${TONE_CLASS[week.tone]}`}
                  >
                    {Math.round(week.rate * 100)} %
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div>
        <h3 className="font-serif text-xl text-stone-900">Éléments hors planning</h3>
        {synthesis.unplaced.length === 0 ? (
          <p className="mt-2 text-sm text-stone-600">Tous les éléments avec une durée ont des dates.</p>
        ) : (
          <ul className="mt-2 space-y-2">
            {synthesis.unplaced.map((item) => (
              <li
                key={`${item.chantier}-${item.element}`}
                className="rounded border border-stone-300 bg-white px-3 py-2 text-sm"
              >
                <span className="font-medium">
                  {item.chantier} — {item.element}
                </span>
                <ul className="mt-1 list-disc pl-5 text-stone-600">
                  {item.reasons.map((reason) => (
                    <li key={reason}>{reason}</li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
