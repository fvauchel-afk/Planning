"use client";

import { useEffect, useMemo, useState } from "react";
import { usePlanning } from "@/lib/planning-context";
import { useSession } from "@/lib/auth/session-context";
import { markCommandesSeen } from "@/components/CommandeAlert";
import { DemandeCongeAdmin, DemandeCongeDetails } from "@/components/DemandeCongeAdmin";
import { COMMANDE_MAIL_TEMPLATE_CHOICES } from "@/lib/mail/commande-templates";
import { demandeEstOuverte } from "@/lib/demandes";
import {
  CATEGORIES_DEMANDE,
  CATEGORIE_DEMANDE_LABELS,
  STATUT_DEMANDE_LABELS,
  type CategorieDemande,
  type Demande,
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
  const { snapshot, loading, updateDemande, sendDemandeMail } = usePlanning();
  const { session } = useSession();
  const canMail = Boolean(session?.canReceiveCommandes);
  const [filtre, setFiltre] = useState<"tout" | CategorieDemande>("tout");
  const [filtreChoisi, setFiltreChoisi] = useState(false);
  const [archives, setArchives] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mailNote, setMailNote] = useState<string | null>(null);

  const activeFiltre: "tout" | CategorieDemande =
    !filtreChoisi && canMail ? "commande" : filtre;

  const nouveauCommandes = useMemo(
    () =>
      (snapshot.demandes ?? []).filter(
        (row) =>
          row.categorie === "commande" &&
          demandeEstOuverte(row) &&
          !row.archivee,
      ).length,
    [snapshot.demandes],
  );
  const nouveauConges = useMemo(
    () =>
      (snapshot.demandes ?? []).filter(
        (row) =>
          row.categorie === "conge" &&
          demandeEstOuverte(row) &&
          !row.archivee,
      ).length,
    [snapshot.demandes],
  );

  const categoryTabs = useMemo(() => {
    if (!canMail) return [...CATEGORIES_DEMANDE];
    return [
      "commande" as const,
      ...CATEGORIES_DEMANDE.filter((id) => id !== "commande"),
    ];
  }, [canMail]);

  const rows = useMemo(() => {
    const list = [...(snapshot.demandes ?? [])].filter((row) =>
      archives ? row.archivee : !row.archivee,
    );
    list.sort((left, right) => {
      if (canMail && activeFiltre === "tout") {
        const leftNew =
          left.categorie === "commande" && demandeEstOuverte(left) ? 1 : 0;
        const rightNew =
          right.categorie === "commande" && demandeEstOuverte(right) ? 1 : 0;
        if (leftNew !== rightNew) return rightNew - leftNew;
      }
      return Date.parse(right.date_creation) - Date.parse(left.date_creation);
    });
    if (activeFiltre === "tout") return list;
    return list.filter((row) => row.categorie === activeFiltre);
  }, [snapshot.demandes, activeFiltre, archives, canMail]);

  useEffect(() => {
    const ids = (snapshot.demandes ?? [])
      .filter((row) => row.categorie === "commande")
      .map((row) => row.id);
    if (ids.length) markCommandesSeen(ids);
  }, [snapshot.demandes]);

  async function sendMail(demande: Demande, templateId: string) {
    setBusyId(demande.id);
    setError(null);
    setMailNote(null);
    try {
      await sendDemandeMail(demande.id, templateId);
      setMailNote("Message envoyé depuis la boîte f.vauchel.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "E-mail impossible.");
    } finally {
      setBusyId(null);
    }
  }

  async function patch(demande: Demande, input: Parameters<typeof updateDemande>[0]) {
    setBusyId(demande.id);
    setError(null);
    try {
      await updateDemande(input);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Mise à jour impossible.",
      );
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-serif text-3xl text-stone-900">
            {archives ? "Demandes archivées" : "Demandes"}
          </h2>
          <p className="mt-1 text-sm text-stone-600">
            {archives
              ? "Anciennes demandes mises de côté, sans les supprimer."
              : canMail
                ? "Vue commandes en priorité. Un e-mail part aussi sur f.vauchel. Les autres admins voient toute la liste."
                : "Liste complète de toutes les demandes, pour supervision."}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setArchives((current) => !current)}
          className="rounded border border-stone-300 bg-white px-3 py-2 text-sm text-stone-800 hover:bg-stone-50"
        >
          {archives ? "Retour aux demandes" : "Voir les archives"}
        </button>
      </div>
      <div className="inline-flex flex-wrap rounded-md border border-stone-300 bg-white p-0.5">
        <button
          type="button"
          onClick={() => {
            setFiltreChoisi(true);
            setFiltre("tout");
          }}
          className={`rounded px-3 py-1.5 text-sm ${
            activeFiltre === "tout"
              ? "bg-stone-900 text-white"
              : "text-stone-700 hover:bg-stone-100"
          }`}
        >
          Tout
        </button>
        {categoryTabs.map((id) => (
          <button
            key={id}
            type="button"
            onClick={() => {
              setFiltreChoisi(true);
              setFiltre(id);
            }}
            className={`inline-flex items-center gap-1.5 rounded px-3 py-1.5 text-sm ${
              activeFiltre === id
                ? "bg-stone-900 text-white"
                : "text-stone-700 hover:bg-stone-100"
            }`}
          >
            {CATEGORIE_DEMANDE_LABELS[id]}
            {id === "commande" && nouveauCommandes > 0 ? (
              <span
                className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold uppercase ${
                  activeFiltre === id
                    ? "bg-amber-400 text-stone-900"
                    : "bg-amber-200 text-amber-950"
                }`}
              >
                {nouveauCommandes > 1
                  ? `${nouveauCommandes} nouveau`
                  : "nouveau"}
              </span>
            ) : null}
            {id === "conge" && nouveauConges > 0 ? (
              <span
                className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold uppercase ${
                  activeFiltre === id
                    ? "bg-amber-400 text-stone-900"
                    : "bg-amber-200 text-amber-950"
                }`}
              >
                {nouveauConges > 1
                  ? `${nouveauConges} nouveau`
                  : "nouveau"}
              </span>
            ) : null}
          </button>
        ))}
      </div>
      {error ? (
        <p className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      ) : null}
      {mailNote ? (
        <p className="rounded border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          {mailNote}
        </p>
      ) : null}
      {loading ? (
        <p className="text-sm text-stone-500">Chargement…</p>
      ) : rows.length === 0 ? (
        <p className="rounded-lg border border-stone-200 bg-white px-4 py-6 text-sm text-stone-500">
          {archives
            ? "Aucune demande archivée pour ce filtre."
            : "Aucune demande pour ce filtre."}
        </p>
      ) : (
        <ul className="space-y-3">
          {rows.map((demande) => {
            const auteur =
              snapshot.employees.find(
                (employee) => employee.id === demande.employe_id,
              )?.nom ?? "Salarié";
            const waiting = demandeEstOuverte(demande);
            const busy = busyId === demande.id;
            const statusClass =
              demande.statut === "refusee"
                ? "bg-red-100 text-red-900"
                : waiting
                  ? "bg-amber-100 text-amber-900"
                  : "bg-green-100 text-green-800";
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
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  <p className="text-xs font-medium uppercase tracking-wide text-amber-800">
                    {CATEGORIE_DEMANDE_LABELS[demande.categorie]}
                  </p>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${statusClass}`}
                  >
                    {STATUT_DEMANDE_LABELS[demande.statut]}
                  </span>
                  {canMail &&
                  demande.categorie === "commande" &&
                  waiting &&
                  !demande.archivee ? (
                    <span className="rounded-full bg-amber-200 px-2 py-0.5 text-[11px] font-semibold uppercase text-amber-950">
                      Nouveau
                    </span>
                  ) : null}
                </div>
                <DemandeCongeDetails demande={demande} />
                {demande.categorie !== "conge" ? (
                <p className="mt-2 whitespace-pre-wrap text-sm text-stone-700">
                  {demande.message}
                </p>
                ) : demande.message &&
                  !demande.date_debut ? (
                <p className="mt-2 whitespace-pre-wrap text-sm text-stone-700">
                  {demande.message}
                </p>
                ) : null}
                {demande.statut === "refusee" && demande.motif_refus ? (
                  <p className="mt-2 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900">
                    Motif de refus : {demande.motif_refus}
                  </p>
                ) : null}
                <div className="mt-3 flex flex-wrap gap-2">
                  {waiting && demande.categorie !== "conge" ? (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() =>
                        void patch(demande, {
                          id: demande.id,
                          statut: "traite",
                        })
                      }
                      className="rounded bg-amber-700 px-3 py-1.5 text-sm text-amber-50 disabled:opacity-60"
                    >
                      {busy ? "Enregistrement…" : "Marquer comme traité"}
                    </button>
                  ) : null}
                  {demande.archivee ? (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() =>
                        void patch(demande, {
                          id: demande.id,
                          archivee: false,
                        })
                      }
                      className="rounded border border-stone-300 bg-white px-3 py-1.5 text-sm text-stone-800 disabled:opacity-60"
                    >
                      Désarchiver
                    </button>
                  ) : (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() =>
                        void patch(demande, {
                          id: demande.id,
                          archivee: true,
                        })
                      }
                      className="rounded border border-stone-300 bg-white px-3 py-1.5 text-sm text-stone-800 disabled:opacity-60"
                    >
                      Archiver
                    </button>
                  )}
                  {canMail && demande.categorie === "commande"
                    ? COMMANDE_MAIL_TEMPLATE_CHOICES.map((template) => (
                        <button
                          key={template.id}
                          type="button"
                          disabled={busy}
                          onClick={() => void sendMail(demande, template.id)}
                          className="rounded border border-amber-300 bg-amber-50 px-3 py-1.5 text-sm text-amber-950 disabled:opacity-60"
                        >
                          {template.label}
                        </button>
                      ))
                    : null}
                </div>
                {waiting && demande.categorie === "conge" ? (
                  <DemandeCongeAdmin
                    demande={demande}
                    busy={busy}
                    onBusy={setBusyId}
                    onError={setError}
                  />
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
