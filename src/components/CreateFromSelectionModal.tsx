"use client";

import { useMemo, useState } from "react";
import { FormNotice } from "@/components/FormNotice";
import { ModalFrame } from "@/components/ModalFrame";
import { PhaseDureeFields } from "@/components/DureeJoursSelect";
import {
  buildChantierFromSelectionPlans,
  planKey,
  plansFromEmptyPicks,
  recapSelectionPlans,
  type EmptyCellPick,
} from "@/lib/engine/create-from-selection";
import { inspectManualSlotConflict } from "@/lib/engine/planner";
import { missingRequiredAssignee } from "@/lib/engine/phase-chain";
import { usePlanning } from "@/lib/planning-context";
import { formatSaveError } from "@/lib/supabase/errors";
import {
  hasPendingSignalements,
  PENDING_CHANTIER_MESSAGE,
} from "@/lib/signalements";
import { PHASE_LABELS } from "@/lib/types";

export function CreateFromSelectionModal({
  picks,
  onClose,
  onCreated,
}: {
  picks: EmptyCellPick[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const { snapshot, createChantier } = usePlanning();
  const parsed = useMemo(
    () => plansFromEmptyPicks(snapshot, picks),
    [snapshot, picks],
  );
  const [nomClient, setNomClient] = useState("");
  const [hoursByPlan, setHoursByPlan] = useState<Record<string, number>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const recap = parsed.plans.length ? recapSelectionPlans(parsed.plans) : [];

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (parsed.error) {
      setError(parsed.error);
      return;
    }
    if (hasPendingSignalements(snapshot)) {
      setError(PENDING_CHANTIER_MESSAGE);
      return;
    }
    const input = buildChantierFromSelectionPlans(
      nomClient,
      parsed.plans,
      hoursByPlan,
    );
    if ("error" in input) {
      setError(input.error);
      return;
    }
    const clash = inspectManualSlotConflict(snapshot, input);
    if (clash) {
      setError(clash.message);
      return;
    }
    const missing = missingRequiredAssignee(input);
    if (missing) {
      setError(missing);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await createChantier(input);
      onCreated();
    } catch (err) {
      setError(formatSaveError(err, "le chantier n’a pas été enregistré"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <ModalFrame as="form" onClose={onClose} onSubmit={onSubmit} maxWidthClass="max-w-lg">
      <h2 className="font-serif text-2xl text-stone-900">Nouveau chantier</h2>
      <p className="mt-1 text-sm text-stone-600">
        Client et durées seulement. L’adresse, le plan et le reste se complètent
        plus tard sur la fiche chantier.
      </p>
      {parsed.error ? (
        <FormNotice className="mt-3">{parsed.error}</FormNotice>
      ) : (
        <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-stone-700">
          {recap.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      )}
      <label className="mt-4 block text-sm font-medium text-stone-800">
        Client
        <input
          autoFocus
          value={nomClient}
          onChange={(event) => setNomClient(event.target.value)}
          className="mt-1 w-full rounded border border-stone-300 bg-white px-3 py-2 text-sm"
          placeholder="Nom du client"
        />
      </label>
      {parsed.plans.map((plan, index) => {
        const key = planKey(plan, index);
        const hours =
          hoursByPlan[key] != null
            ? String(hoursByPlan[key])
            : String(plan.duree_estimee_heures);
        return (
          <div key={key} className="mt-3">
            <p className="text-sm font-medium text-stone-800">
              {PHASE_LABELS[plan.type_phase]} — {plan.employe_nom}
            </p>
            <PhaseDureeFields
              hours={hours}
              snapshot={snapshot}
              employeeId={plan.employe_id}
              ariaLabel={`Durée ${PHASE_LABELS[plan.type_phase]} ${plan.employe_nom}`}
              onHoursChange={(value) =>
                setHoursByPlan((current) => ({
                  ...current,
                  [key]: Number(value),
                }))
              }
            />
          </div>
        );
      })}
      {error ? <FormNotice className="mt-3">{error}</FormNotice> : null}
      <div className="mt-5 flex justify-end gap-2">
        <button
          type="button"
          onClick={onClose}
          className="rounded border border-stone-300 bg-white px-3 py-2 text-sm text-stone-800"
        >
          Annuler
        </button>
        <button
          type="submit"
          disabled={saving || Boolean(parsed.error)}
          className="rounded bg-amber-800 px-3 py-2 text-sm font-medium text-amber-50 disabled:opacity-60"
        >
          {saving ? "Création…" : "Créer"}
        </button>
      </div>
    </ModalFrame>
  );
}
