"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { canManageReunionDirection } from "@/lib/auth/reunion-access";
import { useSession } from "@/lib/auth/session-context";
import { usePlanning } from "@/lib/planning-context";
import { toISODate } from "@/lib/dates";
import {
  categoriesDemandeHorsReunion,
  syntheseMessageConge,
  validateDemandeCongeInput,
} from "@/lib/demandes";
import { PieceJointePicker } from "@/components/PieceJointePicker";
import type { PieceJointe } from "@/lib/pieces-jointes";
import {
  ABSENCE_LABELS,
  CATEGORIE_DEMANDE_LABELS,
  TYPES_ABSENCE,
  type CategorieDemande,
  type TypeAbsence,
} from "@/lib/types";

export function DemandesWidget() {
  const { session } = useSession();
  const { createDemande } = usePlanning();
  const [open, setOpen] = useState(false);
  const [categorie, setCategorie] = useState<CategorieDemande>("commande");
  const [message, setMessage] = useState("");
  const [pieces, setPieces] = useState<PieceJointe[]>([]);
  const today = toISODate(new Date());
  const [dateDebut, setDateDebut] = useState(today);
  const [dateFin, setDateFin] = useState(today);
  const [typeAbsence, setTypeAbsence] = useState<TypeAbsence>("conge");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent) {
      const node = panelRef.current;
      if (!node) return;
      const target = event.target;
      if (target instanceof Node && node.contains(target)) return;
      setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  if (!session) return null;
  const employeeId = session.employeeId;
  const canReunion = Boolean(session.canManageReunionDirection) ||
    canManageReunionDirection(session.nom);
  const categories = canReunion
    ? (["commande", "suggestion_site", "suggestion_entreprise", "reunion_direction", "conge"] as const)
    : categoriesDemandeHorsReunion();
  const isConge = categorie === "conge";
  const canSend = isConge
    ? Boolean(dateDebut && dateFin && typeAbsence) &&
      !(typeAbsence === "autre" && !message.trim())
    : Boolean(message.trim());

  async function send() {
    if (sending) return;
    setSending(true);
    setError(null);
    setSent(false);
    try {
      if (categorie === "reunion_direction" && !canReunion) {
        setError("Cette catégorie est réservée à la direction.");
        return;
      }
      if (categorie === "conge") {
        const input = {
          categorie: "conge" as const,
          message: message.trim(),
          employe_id: employeeId,
          date_debut: dateDebut,
          date_fin: dateFin,
          type_absence: typeAbsence,
          motif_precision: message.trim() || null,
        };
        const invalid = validateDemandeCongeInput(input);
        if (invalid) {
          setError(invalid);
          return;
        }
        await createDemande({
          ...input,
          message: syntheseMessageConge({
            type_absence: typeAbsence,
            date_debut: dateDebut,
            date_fin: dateFin,
            motif_precision: message.trim() || null,
          }),
          photos: pieces,
        });
      } else {
        const text = message.trim();
        if (!text) {
          setError("Écrivez un message avant d’envoyer.");
          return;
        }
        await createDemande({
          categorie,
          message: text,
          employe_id: employeeId,
          photos: pieces,
        });
      }
      setMessage("");
      setPieces([]);
      setSent(true);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Envoi impossible pour le moment.",
      );
    } finally {
      setSending(false);
    }
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    event.stopPropagation();
    void send();
  }

  return (
    <div ref={panelRef} className="fixed bottom-5 right-5 z-[60]">
      {open && (
        <div className="mb-3 w-[min(22rem,calc(100vw-2.5rem))] rounded-2xl border border-stone-300 bg-white shadow-xl">
          <div className="flex items-center justify-between border-b border-stone-200 px-4 py-3">
            <p className="font-medium text-stone-900">Nouvelle demande</p>
            <button
              type="button"
              className="rounded-md px-2 py-1 text-sm text-stone-500 hover:bg-stone-100"
              onClick={() => setOpen(false)}
              aria-label="Fermer"
            >
              ×
            </button>
          </div>
          <div className="flex flex-col gap-1 border-b border-stone-200 p-2">
            {categories.map((id) => (
              <button
                key={id}
                type="button"
                onClick={() => {
                  setCategorie(id);
                  setSent(false);
                }}
                className={`rounded-md px-2 py-2 text-left text-xs font-medium ${
                  categorie === id
                    ? "bg-amber-700 text-amber-50"
                    : "text-stone-600 hover:bg-stone-100"
                }`}
              >
                {CATEGORIE_DEMANDE_LABELS[id]}
              </button>
            ))}
          </div>
          <form className="space-y-3 p-4" onSubmit={onSubmit}>
            {isConge ? (
              <>
                <label className="block text-sm">
                  <span className="mb-1 block text-stone-600">Début</span>
                  <input
                    type="date"
                    value={dateDebut}
                    onChange={(event) => {
                      const value = event.target.value;
                      setDateDebut(value);
                      if (dateFin < value) setDateFin(value);
                      setSent(false);
                    }}
                    className="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm"
                  />
                </label>
                <label className="block text-sm">
                  <span className="mb-1 block text-stone-600">Fin</span>
                  <input
                    type="date"
                    value={dateFin}
                    onChange={(event) => {
                      setDateFin(event.target.value);
                      setSent(false);
                    }}
                    className="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm"
                  />
                </label>
                <label className="block text-sm">
                  <span className="mb-1 block text-stone-600">Type d’absence</span>
                  <select
                    value={typeAbsence}
                    onChange={(event) => {
                      setTypeAbsence(event.target.value as TypeAbsence);
                      setSent(false);
                    }}
                    className="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm"
                  >
                    {TYPES_ABSENCE.map((item) => (
                      <option key={item} value={item}>
                        {ABSENCE_LABELS[item]}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block text-sm">
                  <span className="mb-1 block text-stone-600">
                    Commentaire {typeAbsence === "autre" ? "" : "(optionnel)"}
                  </span>
                  <textarea
                    value={message}
                    onChange={(event) => {
                      setMessage(event.target.value);
                      setSent(false);
                    }}
                    rows={3}
                    maxLength={4000}
                    placeholder={
                      typeAbsence === "autre"
                        ? "Précisez le motif…"
                        : "Précision libre, si besoin"
                    }
                    className="w-full resize-y rounded-lg border border-stone-300 px-3 py-2 text-sm"
                  />
                </label>
              </>
            ) : (
              <label className="block text-sm">
                <span className="mb-1 block text-stone-600">Message</span>
                <textarea
                  value={message}
                  onChange={(event) => {
                    setMessage(event.target.value);
                    setSent(false);
                  }}
                  rows={5}
                  maxLength={4000}
                  placeholder={
                    categorie === "commande"
                      ? "Matériel, outillage… (reçu par Alexis et Mika)"
                      : categorie === "suggestion_entreprise"
                        ? "Organisation, matériel, process atelier…"
                        : categorie === "reunion_direction"
                          ? "Sujet à traiter en réunion de direction…"
                          : "Une idée pour améliorer le site…"
                  }
                  className="w-full resize-y rounded-lg border border-stone-300 px-3 py-2 text-sm"
                />
              </label>
            )}
            <PieceJointePicker
              pieces={pieces}
              onChange={(next) => {
                setPieces(next);
                setSent(false);
              }}
              disabled={sending}
              onError={setError}
            />
            {error && <p className="text-sm text-red-700">{error}</p>}
            {sent && (
              <p className="text-sm text-emerald-700">
                {isConge
                  ? "Demande de congé envoyée. Suivi dans Mes congés."
                  : categorie === "reunion_direction"
                    ? "Sujet ajouté. Il apparaît dans l’onglet Réunion."
                    : "Message envoyé. Merci."}
              </p>
            )}
            <button
              type="submit"
              data-demande-submit="1"
              disabled={sending || !canSend}
              onPointerDown={(event) => event.stopPropagation()}
              className="w-full rounded-lg bg-stone-900 px-3 py-2.5 text-sm font-medium text-white disabled:opacity-50"
            >
              {sending ? "Envoi…" : "Envoyer"}
            </button>
          </form>
        </div>
      )}
      <button
        type="button"
        onClick={() => {
          setOpen((current) => !current);
          setSent(false);
          setError(null);
        }}
        aria-label="Ouvrir les demandes"
        aria-expanded={open}
        className="ml-auto flex h-14 w-14 items-center justify-center rounded-full bg-amber-700 text-amber-50 shadow-lg hover:bg-amber-800"
      >
        <svg
          viewBox="0 0 24 24"
          className="h-7 w-7"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M4.5 12.75c0-3.866 3.582-7 8-7s8 3.134 8 7-3.582 7-8 7c-.86 0-1.68-.12-2.44-.35L5.25 20.25l.9-3.15A6.7 6.7 0 0 1 4.5 12.75Z"
          />
        </svg>
      </button>
    </div>
  );
}
