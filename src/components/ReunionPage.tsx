"use client";

import { useMemo, useState } from "react";
import { usePlanning } from "@/lib/planning-context";
import { demandeEstOuverte, isReunionDirectionDemande } from "@/lib/demandes";
import type { Demande } from "@/lib/types";

function formatWhen(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString("fr-FR", {
    dateStyle: "short",
    timeStyle: "short",
  });
}

export function ReunionPage() {
  const { snapshot, loading, updateDemande } = usePlanning();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const sujets = useMemo(
    () =>
      (snapshot.demandes ?? [])
        .filter((row) => isReunionDirectionDemande(row) && !row.archivee)
        .sort(
          (left, right) =>
            Date.parse(right.date_creation) - Date.parse(left.date_creation),
        ),
    [snapshot.demandes],
  );
  const aTraiter = sujets.filter((row) => demandeEstOuverte(row));
  const regles = sujets.filter((row) => !demandeEstOuverte(row));

  async function toggle(demande: Demande, regle: boolean) {
    setBusyId(demande.id);
    setError(null);
    try {
      await updateDemande({
        id: demande.id,
        statut: regle ? "traite" : "en_attente",
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Mise à jour impossible.");
    } finally {
      setBusyId(null);
    }
  }

  function nomAuteur(id: string) {
    return snapshot.employees.find((employee) => employee.id === id)?.nom ?? "—";
  }

  function Liste({
    titre,
    rows,
    vide,
    regle,
  }: {
    titre: string;
    rows: Demande[];
    vide: string;
    regle: boolean;
  }) {
    return (
      <section className="space-y-3">
        <h3 className="font-medium text-stone-900">
          {titre}
          <span className="ml-2 text-sm font-normal text-stone-500">
            ({rows.length})
          </span>
        </h3>
        {rows.length === 0 ? (
          <p className="rounded-lg border border-stone-200 bg-white px-4 py-6 text-sm text-stone-500">
            {vide}
          </p>
        ) : (
          <ul className="space-y-2">
            {rows.map((demande) => {
              const busy = busyId === demande.id;
              return (
                <li key={demande.id}>
                  <label
                    className={`flex cursor-pointer items-start gap-3 rounded-lg border px-4 py-3 shadow-sm ${
                      regle
                        ? "border-stone-200 bg-stone-50 text-stone-500"
                        : "border-amber-200 bg-amber-50 text-stone-900"
                    }`}
                  >
                    <input
                      type="checkbox"
                      className="mt-1 h-4 w-4 shrink-0 accent-amber-700"
                      checked={regle}
                      disabled={busy}
                      onChange={() => void toggle(demande, !regle)}
                    />
                    <span className="min-w-0 flex-1">
                      <span
                        className={`block whitespace-pre-wrap text-sm ${
                          regle ? "line-through" : "font-medium"
                        }`}
                      >
                        {demande.message}
                      </span>
                      <span className="mt-1 block text-xs">
                        Déposé le {formatWhen(demande.date_creation)} par{" "}
                        {nomAuteur(demande.employe_id)}
                      </span>
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    );
  }

  return (
    <section className="space-y-6">
      <div>
        <h2 className="font-serif text-3xl text-stone-900">Réunion</h2>
        <p className="mt-1 text-sm text-stone-600">
          Sujets de réunion de direction. Cochez au fur et à mesure : les
          réglés restent en historique en dessous.
        </p>
      </div>
      {error ? (
        <p className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      ) : null}
      {loading ? (
        <p className="text-sm text-stone-500">Chargement…</p>
      ) : (
        <>
          <Liste
            titre="À traiter"
            rows={aTraiter}
            vide="Aucun sujet en attente. Ajoutez-en depuis la bulle, catégorie Sujet Réunion Direction."
            regle={false}
          />
          <Liste
            titre="Réglés"
            rows={regles}
            vide="Aucun sujet réglé pour l’instant."
            regle={true}
          />
        </>
      )}
    </section>
  );
}
