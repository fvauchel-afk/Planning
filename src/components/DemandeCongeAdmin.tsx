"use client";

import { useEffect, useMemo, useState } from "react";
import { AbsenceImpactEditor } from "@/components/AbsenceImpactEditor";
import { ConflictModal } from "@/components/ConflictModal";
import { formatLongDate } from "@/lib/dates";
import {
  absenceInputFromDemande,
  demandeEstOuverte,
} from "@/lib/demandes";
import {
  candidatesForChoices,
  defaultAbsenceChoices,
  listImpactedPhases,
  type AbsencePhaseChoice,
} from "@/lib/engine/absence-imprevue";
import type { DelayPlanResult } from "@/lib/engine/delay";
import { applyRecordedAbsence } from "@/lib/planning/apply-recorded-absence";
import { matchingRecordedAbsence } from "@/lib/signalements";
import { formatSaveError } from "@/lib/supabase/errors";
import { ABSENCE_LABELS, absenceLabel, type Demande } from "@/lib/types";
import { usePlanning } from "@/lib/planning-context";

export function DemandeCongeAdmin({
  demande,
  busy,
  onBusy,
  onError,
}: {
  demande: Demande;
  busy: boolean;
  onBusy: (id: string | null) => void;
  onError: (message: string | null) => void;
}) {
  const {
    snapshot,
    createAbsence,
    applyPhasePatches,
    createSignalement,
    updateDemande,
    refresh,
  } = usePlanning();
  const [motif, setMotif] = useState("");
  const [review, setReview] = useState(false);
  const [choices, setChoices] = useState<Record<string, AbsencePhaseChoice>>(
    {},
  );
  const [conflict, setConflict] = useState<DelayPlanResult | null>(null);
  const [saving, setSaving] = useState(false);

  const payload = absenceInputFromDemande(demande);
  const impacted = useMemo(
    () =>
      payload
        ? listImpactedPhases(
            snapshot,
            payload.employe_id,
            payload.date_debut,
            payload.date_fin,
          )
        : [],
    [payload, snapshot],
  );
  const candidates = useMemo(
    () =>
      payload ? candidatesForChoices(snapshot, impacted, choices) : {},
    [choices, impacted, payload, snapshot],
  );

  useEffect(() => {
    if (!review || !payload) return;
    setChoices((current) => defaultAbsenceChoices(snapshot, impacted, current));
  }, [impacted, payload, review, snapshot]);

  if (!demandeEstOuverte(demande) || demande.categorie !== "conge") return null;

  async function finishAccepted() {
    const latest = (await refresh({ quiet: true })) ?? snapshot;
    const absence = payload
      ? matchingRecordedAbsence(latest, payload)
      : undefined;
    await updateDemande({
      id: demande.id,
      statut: "acceptee",
      absence_id: absence?.id ?? null,
    });
  }

  async function persist(forceConflict = false) {
    if (!payload) {
      onError("Cette demande n’a pas de dates ou de type d’absence.");
      return;
    }
    setSaving(true);
    onBusy(demande.id);
    onError(null);
    try {
      const result = await applyRecordedAbsence({
        snapshot,
        payload,
        choices,
        forceConflict,
        previousConflict: conflict,
        createAbsence,
        applyPhasePatches,
        createSignalement,
      });
      if (result.kind === "conflict") {
        setConflict(result.plan);
        return;
      }
      if (result.kind === "pending_similar") {
        await finishAccepted();
        setReview(false);
        setConflict(null);
        return;
      }
      await finishAccepted();
      setReview(false);
      setConflict(null);
    } catch (err) {
      onError(formatSaveError(err, "l’acceptation n’a pas abouti"));
    } finally {
      setSaving(false);
      onBusy(null);
    }
  }

  async function refuse() {
    const text = motif.trim();
    if (!text) {
      onError("Indiquez un motif de refus.");
      return;
    }
    setSaving(true);
    onBusy(demande.id);
    onError(null);
    try {
      await updateDemande({
        id: demande.id,
        statut: "refusee",
        motif_refus: text,
      });
      setMotif("");
    } catch (err) {
      onError(formatSaveError(err, "le refus n’a pas abouti"));
    } finally {
      setSaving(false);
      onBusy(null);
    }
  }

  const employeeName =
    snapshot.employees.find((item) => item.id === demande.employe_id)?.nom ??
    "Ce salarié";

  return (
    <>
      <div className="mt-3 space-y-2">
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={busy || saving}
            onClick={() => {
              if (!payload) {
                onError("Cette demande n’a pas de dates ou de type d’absence.");
                return;
              }
              if (impacted.length > 0) {
                setReview(true);
                return;
              }
              void persist(false);
            }}
            className="rounded bg-emerald-800 px-3 py-1.5 text-sm text-emerald-50 disabled:opacity-60"
          >
            {saving ? "Enregistrement…" : "Accepter"}
          </button>
        </div>
        <label className="block text-sm">
          <span className="mb-1 block text-stone-600">Motif de refus</span>
          <textarea
            value={motif}
            onChange={(event) => setMotif(event.target.value)}
            rows={2}
            maxLength={1000}
            placeholder="Visible par le salarié dans Mes congés"
            className="w-full resize-y rounded border border-stone-300 px-3 py-2 text-sm"
          />
        </label>
        <button
          type="button"
          disabled={busy || saving || !motif.trim()}
          onClick={() => void refuse()}
          className="rounded border border-red-300 bg-red-50 px-3 py-1.5 text-sm text-red-900 disabled:opacity-60"
        >
          Refuser
        </button>
      </div>

      {review && payload && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/50 p-4">
          <div className="max-h-[90vh] w-full max-w-xl overflow-auto rounded-xl bg-white p-5 shadow-xl">
            <h3 className="font-serif text-2xl text-stone-900">
              Accepter la demande de congé
            </h3>
            <p className="mt-2 text-sm text-stone-600">
              {employeeName} : {absenceLabel(payload)} du{" "}
              {formatLongDate(payload.date_debut)}
              {payload.date_fin !== payload.date_debut
                ? ` au ${formatLongDate(payload.date_fin)}`
                : ""}
              . L’absence sera créée comme dans Absences, avec le même moteur de
              conflit de placement.
            </p>
            <div className="mt-4">
              {impacted.length === 0 ? (
                <p className="rounded border border-stone-200 bg-stone-50 px-3 py-2 text-sm text-stone-600">
                  Aucune tâche planifiée sur cette période.
                </p>
              ) : (
                <AbsenceImpactEditor
                  impacted={impacted}
                  candidates={candidates}
                  choices={choices}
                  onChange={setChoices}
                />
              )}
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                disabled={saving}
                className="rounded-lg bg-stone-900 px-4 py-2 text-sm text-white disabled:opacity-60"
                onClick={() => void persist(false)}
              >
                {saving ? "Enregistrement…" : "Confirmer l’absence"}
              </button>
              <button
                type="button"
                disabled={saving}
                className="rounded-lg border border-stone-300 px-4 py-2 text-sm"
                onClick={() => {
                  setReview(false);
                  setConflict(null);
                }}
              >
                Annuler
              </button>
            </div>
          </div>
        </div>
      )}

      {conflict && (
        <ConflictModal
          title="Conflit de placement"
          message={conflict.message}
          displacements={conflict.displacements}
          incoming={[]}
          showIncoming={false}
          showCancel={false}
          validateLabel="Envoyer pour validation"
          adjustLabel="Annuler"
          busy={saving}
          onValidate={() => {
            void persist(true);
          }}
          onAdjust={() => setConflict(null)}
          onCancel={() => setConflict(null)}
        />
      )}
    </>
  );
}

export function DemandeCongeDetails({ demande }: { demande: Demande }) {
  if (demande.categorie !== "conge") return null;
  const type = demande.type_absence
    ? ABSENCE_LABELS[demande.type_absence]
    : null;
  return (
    <p className="mt-2 text-sm text-stone-700">
      {type ? `${type} · ` : ""}
      {demande.date_debut ? formatLongDate(demande.date_debut) : "—"}
      {demande.date_fin && demande.date_fin !== demande.date_debut
        ? ` → ${formatLongDate(demande.date_fin)}`
        : ""}
      {demande.motif_precision?.trim()
        ? ` — ${demande.motif_precision.trim()}`
        : ""}
    </p>
  );
}
