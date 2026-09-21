"use client";

import { useEffect, useMemo, useState } from "react";
import { ConflictModal } from "@/components/ConflictModal";
import { ModalFrame } from "@/components/ModalFrame";
import { AbsenceImpactEditor } from "@/components/AbsenceImpactEditor";
import {
  candidatesForChoices,
  defaultAbsenceChoices,
  listImpactedPhases,
  planAbsenceImprevue,
  type AbsencePhaseChoice,
} from "@/lib/engine/absence-imprevue";
import { formatLongDate, toISODate } from "@/lib/dates";
import { needsAlgoValidation, propositionFromDelay } from "@/lib/signalements";
import { usePlanning } from "@/lib/planning-context";
import {
  ABSENCE_LABELS,
  TYPES_ABSENCE,
  absenceLabel,
  type Employee,
  type TypeAbsence,
} from "@/lib/types";

export function AbsenceImprevueModal({
  employee,
  onClose,
}: {
  employee: Employee;
  onClose: () => void;
}) {
  const { snapshot, createAbsence, applyPhasePatches, createSignalement } =
    usePlanning();
  const today = toISODate(new Date());
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);
  const [type, setType] = useState<TypeAbsence>("maladie");
  const [motifPrecision, setMotifPrecision] = useState("");
  const [step, setStep] = useState<"period" | "phases">("period");
  const [choices, setChoices] = useState<Record<string, AbsencePhaseChoice>>({});
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [conflict, setConflict] = useState<ReturnType<typeof planAbsenceImprevue> | null>(
    null,
  );

  const impacted = useMemo(
    () =>
      from && to && to >= from
        ? listImpactedPhases(snapshot, employee.id, from, to)
        : [],
    [employee.id, from, snapshot, to],
  );

  const candidates = useMemo(
    () => candidatesForChoices(snapshot, impacted, choices),
    [choices, impacted, snapshot],
  );

  useEffect(() => {
    setChoices((current) => defaultAbsenceChoices(snapshot, impacted, current));
  }, [impacted, snapshot]);

  async function persist(forceConflict = false) {
    if (to < from) {
      setError("La date de fin doit être après la date de début.");
      return;
    }
    if (type === "autre" && !motifPrecision.trim()) {
      setError("Précisez le motif pour une absence de type « Autre ».");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const absence = {
        employe_id: employee.id,
        date_debut: from,
        date_fin: to,
        type,
        motif_precision: type === "autre" ? motifPrecision.trim() : null,
      };
      const plan = planAbsenceImprevue(snapshot, absence, choices);
      if (plan.status === "conflict" && !forceConflict) {
        setConflict(plan);
        return;
      }
      await createAbsence(absence);
      if (needsAlgoValidation(plan)) {
        await createSignalement({
          employe_id: employee.id,
          phase_id: impacted[0]?.phase.id ?? plan.patches[0]?.id ?? null,
          retard_demi_journees: 1,
          sens: "retard",
          note: `Absence du ${from} au ${to} : l’algorithme propose des décalages, non appliqués tant que Mika ou Alexis n’a pas validé.`,
          origine: "decalage_admin",
          statut: "en_attente",
          proposition: propositionFromDelay(snapshot, plan),
        });
      } else if (plan.patches.length > 0) {
        await applyPhasePatches(plan.patches);
      }
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Enregistrement impossible.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
    <ModalFrame onClose={onClose} maxWidthClass="max-w-xl">
        <h3 className="font-serif text-2xl text-stone-900">Absence imprévue</h3>
        <p className="mt-1 text-sm text-stone-600">{employee.nom}</p>

        {step === "period" ? (
          <div className="mt-4 space-y-3">
            <label className="block text-sm">
              <span className="mb-1 block font-medium">Début</span>
              <input
                type="date"
                value={from}
                onChange={(event) => {
                  const value = event.target.value;
                  setFrom(value);
                  if (to < value) setTo(value);
                }}
                className="w-full rounded border border-stone-300 px-3 py-2"
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block font-medium">Fin</span>
              <input
                type="date"
                value={to}
                onChange={(event) => setTo(event.target.value)}
                className="w-full rounded border border-stone-300 px-3 py-2"
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block font-medium">Type</span>
              <select
                value={type}
                onChange={(event) => setType(event.target.value as TypeAbsence)}
                className="w-full rounded border border-stone-300 px-3 py-2"
              >
                {TYPES_ABSENCE.map((item) => (
                  <option key={item} value={item}>
                    {ABSENCE_LABELS[item]}
                  </option>
                ))}
              </select>
            </label>
            {type === "autre" && (
              <label className="block text-sm">
                <span className="mb-1 block font-medium">Préciser le motif</span>
                <input
                  value={motifPrecision}
                  onChange={(event) => setMotifPrecision(event.target.value)}
                  placeholder="Ex. rendez-vous administratif…"
                  className="w-full rounded border border-stone-300 px-3 py-2"
                />
              </label>
            )}
            <p className="text-xs text-stone-500">
              Par défaut : aujourd’hui uniquement. Élargissez les dates si
              l’absence dure plusieurs jours.
            </p>
            {error && <p className="text-sm text-red-700">{error}</p>}
            <div className="flex gap-2 pt-2">
              <button
                type="button"
                className="rounded-lg bg-stone-900 px-4 py-2 text-sm text-white"
                onClick={() => {
                  if (to < from) {
                    setError("La date de fin doit être après la date de début.");
                    return;
                  }
                  if (type === "autre" && !motifPrecision.trim()) {
                    setError(
                      "Précisez le motif pour une absence de type « Autre ».",
                    );
                    return;
                  }
                  setError(null);
                  setStep("phases");
                }}
              >
                Continuer
              </button>
              <button
                type="button"
                className="rounded-lg px-4 py-2 text-sm text-stone-600"
                onClick={onClose}
              >
                Annuler
              </button>
            </div>
          </div>
        ) : (
          <div className="mt-4 space-y-3">
            <p className="text-sm text-stone-600">
              {formatLongDate(from)}
              {to !== from ? ` → ${formatLongDate(to)}` : ""} ·{" "}
              {absenceLabel({ type, motif_precision: motifPrecision })}
            </p>
            {impacted.length === 0 ? (
              <p className="rounded border border-stone-200 bg-stone-50 px-3 py-2 text-sm text-stone-600">
                Aucune tâche planifiée sur cette période. L’absence sera
                simplement enregistrée.
              </p>
            ) : (
              <AbsenceImpactEditor
                impacted={impacted}
                candidates={candidates}
                choices={choices}
                onChange={setChoices}
              />
            )}
            {error && <p className="text-sm text-red-700">{error}</p>}
            <div className="flex flex-wrap gap-2 pt-2">
              <button
                type="button"
                disabled={saving}
                className="rounded-lg bg-stone-900 px-4 py-2 text-sm text-white disabled:opacity-60"
                onClick={() => void persist(false)}
              >
                {saving ? "Enregistrement…" : "Valider"}
              </button>
              <button
                type="button"
                className="rounded-lg border border-stone-300 px-4 py-2 text-sm"
                onClick={() => setStep("period")}
              >
                Retour
              </button>
              <button
                type="button"
                className="rounded-lg px-4 py-2 text-sm text-stone-600"
                onClick={onClose}
              >
                Annuler
              </button>
            </div>
          </div>
        )}
    </ModalFrame>

      {conflict && (
        <ConflictModal
          title="Conflit de priorité"
          message={conflict.message}
          displacements={conflict.displacements}
          incoming={[]}
          showIncoming={false}
          validateLabel="Envoyer pour validation"
          adjustLabel="Annuler"
          showCancel={false}
          onValidate={() => {
            setConflict(null);
            void persist(true);
          }}
          onAdjust={() => setConflict(null)}
          onCancel={() => setConflict(null)}
        />
      )}
    </>
  );
}
