"use client";

import { useMemo } from "react";
import { formatLongDate } from "@/lib/dates";
import { TARGET_LOAD, buildSynthesis } from "@/lib/engine/capacity";
import { usePlanning } from "@/lib/planning-context";

const TONE_CLASS = {
  green: "bg-emerald-100 text-emerald-900 border-emerald-300",
  orange: "bg-amber-100 text-amber-950 border-amber-300",
  red: "bg-red-100 text-red-900 border-red-300",
};

export function SynthesePage() {
  const { snapshot, loading } = usePlanning();
  const synthesis = useMemo(
    () =>
      loading
        ? { weeks: [], unplaced: [], target: TARGET_LOAD }
        : buildSynthesis(snapshot, 12),
    [loading, snapshot],
  );

  return (
    <section className="space-y-6">
      <div>
        <h2 className="font-serif text-3xl text-stone-900">Synthèse de charge</h2>
        <p className="mt-1 text-sm text-stone-600">
          Heures planifiées vs capacité réelle (horaires de chaque salarié selon
          la saison été/hiver en cours), semaine par semaine. Repère vert ≤ 80 %,
          orange 80–110 % (zone tolérée), rouge &gt; 110 % (surcharge).
        </p>
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
                <td className="px-3 py-2">
                  Semaine du {formatLongDate(week.weekStart)}
                </td>
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
        <h3 className="font-serif text-xl text-stone-900">
          Éléments hors planning
        </h3>
        {synthesis.unplaced.length === 0 ? (
          <p className="mt-2 text-sm text-stone-600">
            Tous les éléments avec une durée ont des dates.
          </p>
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
