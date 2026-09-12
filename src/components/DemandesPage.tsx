"use client";

import { useMemo, useState } from "react";
import { usePlanning } from "@/lib/planning-context";
import {
  CATEGORIES_DEMANDE,
  CATEGORIE_DEMANDE_LABELS,
  type CategorieDemande,
} from "@/lib/types";

function formatDemandeWhen(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString("fr-FR", {
    dateStyle: "short",
    timeStyle: "short",
  });
}

export function DemandesPage() {
  const { snapshot, loading } = usePlanning();
  const [filtre, setFiltre] = useState<"tout" | CategorieDemande>("tout");
  const rows = useMemo(() => {
    const list = [...(snapshot.demandes ?? [])].sort(
      (left, right) =>
        Date.parse(right.date_creation) - Date.parse(left.date_creation),
    );
    if (filtre === "tout") return list;
    return list.filter((row) => row.categorie === filtre);
  }, [snapshot.demandes, filtre]);

  return (
    <section className="space-y-5">
      <div>
        <h2 className="font-serif text-3xl text-stone-900">Demandes</h2>
        <p className="mt-1 text-sm text-stone-600">
          Messages envoyés par l’équipe depuis la bulle : commandes (matériel,
          outillage…) et suggestions pour le site.
        </p>
      </div>
      <div className="inline-flex flex-wrap rounded-md border border-stone-300 bg-white p-0.5">
        <button
          type="button"
          onClick={() => setFiltre("tout")}
          className={`rounded px-3 py-1.5 text-sm ${
            filtre === "tout"
              ? "bg-stone-900 text-white"
              : "text-stone-700 hover:bg-stone-100"
          }`}
        >
          Tout
        </button>
        {CATEGORIES_DEMANDE.map((id) => (
          <button
            key={id}
            type="button"
            onClick={() => setFiltre(id)}
            className={`rounded px-3 py-1.5 text-sm ${
              filtre === id
                ? "bg-stone-900 text-white"
                : "text-stone-700 hover:bg-stone-100"
            }`}
          >
            {CATEGORIE_DEMANDE_LABELS[id]}
          </button>
        ))}
      </div>
      {loading ? (
        <p className="text-sm text-stone-500">Chargement…</p>
      ) : rows.length === 0 ? (
        <p className="rounded-lg border border-stone-200 bg-white px-4 py-6 text-sm text-stone-500">
          Aucune demande pour ce filtre.
        </p>
      ) : (
        <ul className="space-y-3">
          {rows.map((demande) => {
            const auteur =
              snapshot.employees.find(
                (employee) => employee.id === demande.employe_id,
              )?.nom ?? "Salarié";
            return (
              <li
                key={demande.id}
                className="rounded-lg border border-stone-200 bg-white px-4 py-3 shadow-sm"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="font-medium text-stone-900">{auteur}</p>
                  <p className="text-xs text-stone-500">
                    {formatDemandeWhen(demande.date_creation)}
                  </p>
                </div>
                <p className="mt-1 text-xs font-medium uppercase tracking-wide text-amber-800">
                  {CATEGORIE_DEMANDE_LABELS[demande.categorie]}
                </p>
                <p className="mt-2 whitespace-pre-wrap text-sm text-stone-700">
                  {demande.message}
                </p>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
