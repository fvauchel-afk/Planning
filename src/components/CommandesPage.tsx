"use client";

import { useEffect, useMemo, useState } from "react";
import { markCommandesSeen } from "@/components/CommandeAlert";
import { FournituresEditor } from "@/components/FournituresEditor";
import { chantierOnedriveHref } from "@/lib/fournitures";
import {
  STATUT_COMMANDE_LABELS,
  STATUTS_COMMANDE,
  commandeEstOuverte,
  parseStatutCommande,
} from "@/lib/commandes";
import { demandeEstOuverte } from "@/lib/demandes";
import { formatSaveError } from "@/lib/supabase/errors";
import { usePlanning } from "@/lib/planning-context";
import type { Commande } from "@/lib/types";

function formatWhen(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString("fr-FR", {
    dateStyle: "short",
    timeStyle: "short",
  });
}

export function CommandesPage() {
  const { snapshot, loading, patchCommande, updateDemande } = usePlanning();
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const ouvertes = useMemo(
    () => (snapshot.commandes ?? []).filter(commandeEstOuverte),
    [snapshot.commandes],
  );
  const closes = useMemo(
    () => (snapshot.commandes ?? []).filter((row) => !commandeEstOuverte(row)),
    [snapshot.commandes],
  );
  const anciennes = useMemo(
    () =>
      (snapshot.demandes ?? []).filter(
        (row) =>
          row.categorie === "commande" &&
          !row.archivee &&
          row.statut !== "traite",
      ),
    [snapshot.demandes],
  );

  useEffect(() => {
    const ids = [
      ...(snapshot.commandes ?? []).map((row) => row.id),
      ...anciennes.map((row) => row.id),
    ];
    if (ids.length) markCommandesSeen(ids);
  }, [snapshot.commandes, anciennes]);

  async function patch(id: string, input: Parameters<typeof patchCommande>[0]) {
    setBusyId(id);
    setError(null);
    try {
      await patchCommande(input);
    } catch (err) {
      setError(formatSaveError(err, "la commande n’a pas été enregistrée"));
    } finally {
      setBusyId(null);
    }
  }

  function card(commande: Commande) {
    const href = chantierOnedriveHref(commande.onedrive_lien);
    const busy = busyId === commande.id;
    return (
      <article
        key={commande.id}
        className="space-y-3 rounded-lg border border-stone-200 bg-white p-4"
      >
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h3 className="font-medium text-stone-900">{commande.nom_client}</h3>
            <p className="text-xs text-stone-500">{formatWhen(commande.date_creation)}</p>
          </div>
          <label className="text-sm">
            <span className="sr-only">Statut</span>
            <select
              disabled={busy}
              value={commande.statut}
              onChange={(event) =>
                void patch(commande.id, {
                  id: commande.id,
                  statut: parseStatutCommande(event.target.value),
                })
              }
              className="rounded border border-stone-300 bg-white px-2 py-1 text-sm"
            >
              {STATUTS_COMMANDE.map((id) => (
                <option key={id} value={id}>
                  {STATUT_COMMANDE_LABELS[id]}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label className="block text-sm">
          <span className="mb-1 block font-medium">Fournisseur</span>
          <input
            defaultValue={commande.fournisseur ?? ""}
            disabled={busy}
            placeholder="Nom du fournisseur (texte libre)"
            className="w-full rounded border border-stone-300 px-3 py-2"
            onBlur={(event) => {
              const next = event.target.value.trim() || null;
              if (next === (commande.fournisseur ?? null)) return;
              void patch(commande.id, { id: commande.id, fournisseur: next });
            }}
          />
        </label>
        <FournituresEditor
          disabled={busy}
          rows={commande.fournitures}
          onChange={(fournitures) =>
            void patch(commande.id, { id: commande.id, fournitures })
          }
        />
        <p className="text-sm text-stone-600">
          {href ? (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sky-800 underline"
            >
              Dossier OneDrive
            </a>
          ) : (
            "Dossier OneDrive : non renseigné"
          )}
        </p>
      </article>
    );
  }

  return (
    <section className="space-y-6">
      <div>
        <h2 className="font-serif text-3xl text-stone-900">Commande</h2>
        <p className="mt-1 text-sm text-stone-600">
          Une ligne se crée au clic sur « Plan validé » sur la fiche chantier.
          Tous les admins voient la liste et peuvent changer le statut.
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
          <div className="space-y-3">
            <h3 className="text-sm font-medium text-stone-700">
              À traiter ({ouvertes.length})
            </h3>
            {ouvertes.length === 0 ? (
              <p className="text-sm text-stone-500">Aucune commande en cours.</p>
            ) : (
              ouvertes.map(card)
            )}
          </div>
          {closes.length > 0 ? (
            <div className="space-y-3">
              <h3 className="text-sm font-medium text-stone-700">
                Effectuées ({closes.length})
              </h3>
              {closes.map(card)}
            </div>
          ) : null}
          {anciennes.length > 0 ? (
            <div className="space-y-2">
              <h3 className="text-sm font-medium text-stone-700">
                Anciennes commandes (Demandes)
              </h3>
              <p className="text-xs text-stone-500">
                Créées avant cet onglet. Le suivi se fait ici pour les nouvelles.
              </p>
              <ul className="space-y-2">
                {anciennes.map((row) => {
                  const busy = busyId === row.id;
                  return (
                    <li
                      key={row.id}
                      className="rounded-lg border border-stone-200 bg-stone-50 p-3 text-sm text-stone-700"
                    >
                      <p className="whitespace-pre-wrap">{row.message}</p>
                      {demandeEstOuverte(row) ? (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => {
                            setBusyId(row.id);
                            setError(null);
                            void updateDemande({ id: row.id, statut: "traite" })
                              .catch((err) =>
                                setError(
                                  formatSaveError(
                                    err,
                                    "la commande n’a pas été enregistrée",
                                  ),
                                ),
                              )
                              .finally(() => setBusyId(null));
                          }}
                          className="mt-2 rounded bg-amber-700 px-3 py-1.5 text-sm text-amber-50 disabled:opacity-60"
                        >
                          {busy ? "Enregistrement…" : "Marquer comme traité"}
                        </button>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            </div>
          ) : null}
        </>
      )}
    </section>
  );
}
