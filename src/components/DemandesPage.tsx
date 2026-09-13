"use client";

import { useEffect, useMemo, useState } from "react";
import { usePlanning } from "@/lib/planning-context";
import { useSession } from "@/lib/auth/session-context";
import { markCommandesSeen } from "@/components/CommandeAlert";
import { COMMANDE_MAIL_TEMPLATE_CHOICES } from "@/lib/mail/commande-templates";
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
  const [archives, setArchives] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mailNote, setMailNote] = useState<string | null>(null);

  const rows = useMemo(() => {
    const list = [...(snapshot.demandes ?? [])]
      .filter((row) => (archives ? row.archivee : !row.archivee))
      .sort(
        (left, right) =>
          Date.parse(right.date_creation) - Date.parse(left.date_creation),
      );
    if (filtre === "tout") return list;
    return list.filter((row) => row.categorie === filtre);
  }, [snapshot.demandes, filtre, archives]);

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
                ? "Les commandes (matériel, outillage…) sont à traiter par Alexis et Mika. Un e-mail part aussi sur la boîte f.vauchel. Les autres admins voient la liste complète pour supervision."
                : "Toutes les demandes, y compris les commandes. Le traitement et les e-mails de commandes sont gérés par Alexis et Mika."}
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
            const waiting = demande.statut !== "traite";
            const busy = busyId === demande.id;
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
                    className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                      waiting
                        ? "bg-amber-100 text-amber-900"
                        : "bg-green-100 text-green-800"
                    }`}
                  >
                    {STATUT_DEMANDE_LABELS[demande.statut]}
                  </span>
                </div>
                <p className="mt-2 whitespace-pre-wrap text-sm text-stone-700">
                  {demande.message}
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {waiting ? (
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
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
