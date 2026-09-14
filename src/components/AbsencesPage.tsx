"use client";

import { useEffect, useMemo, useState } from "react";
import { AbsenceImpactEditor } from "@/components/AbsenceImpactEditor";
import { ConflictModal } from "@/components/ConflictModal";
import { formatLongDate } from "@/lib/dates";
import { compareEmployeesByOrdre } from "@/lib/display-order";
import {
  candidatesForChoices,
  defaultAbsenceChoices,
  listImpactedPhases,
  planAbsenceImprevue,
  type AbsencePhaseChoice,
} from "@/lib/engine/absence-imprevue";
import { generateDelaySolutions, propositionFromSolutions } from "@/lib/engine/plan-solutions";
import { usePlanning } from "@/lib/planning-context";
import { needsAlgoValidation, propositionFromDelay } from "@/lib/signalements";
import { formatSaveError } from "@/lib/supabase/errors";
import {
  ABSENCE_LABELS,
  TYPES_ABSENCE,
  absenceLabel,
  type Absence,
  type NewAbsenceInput,
  type TypeAbsence,
} from "@/lib/types";

export function AbsencesPage() {
  const {
    snapshot,
    createAbsence,
    updateAbsence,
    deleteAbsence,
    applyPhasePatches,
    createSignalement,
  } = usePlanning();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [employeId, setEmployeId] = useState("");
  const [type, setType] = useState<TypeAbsence>("conge");
  const [dateDebut, setDateDebut] = useState("");
  const [dateFin, setDateFin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [motifPrecision, setMotifPrecision] = useState("");
  const [reviewPayload, setReviewPayload] = useState<NewAbsenceInput | null>(null);
  const [choices, setChoices] = useState<Record<string, AbsencePhaseChoice>>({});
  const [saving, setSaving] = useState(false);
  const [conflict, setConflict] = useState<ReturnType<typeof planAbsenceImprevue> | null>(
    null,
  );

  const employeesById = new Map(
    snapshot.employees.map((employee) => [employee.id, employee]),
  );

  const impacted = useMemo(
    () =>
      reviewPayload
        ? listImpactedPhases(
            snapshot,
            reviewPayload.employe_id,
            reviewPayload.date_debut,
            reviewPayload.date_fin,
          )
        : [],
    [reviewPayload, snapshot],
  );

  const candidates = useMemo(
    () =>
      reviewPayload
        ? candidatesForChoices(snapshot, impacted, choices)
        : {},
    [choices, impacted, reviewPayload, snapshot],
  );

  useEffect(() => {
    if (!reviewPayload) return;
    setChoices((current) => defaultAbsenceChoices(snapshot, impacted, current));
  }, [impacted, reviewPayload, snapshot]);

  function resetForm() {
    setEditingId(null);
    setEmployeId("");
    setType("conge");
    setDateDebut("");
    setDateFin("");
    setMotifPrecision("");
    setError(null);
    setReviewPayload(null);
    setChoices({});
    setConflict(null);
  }

  function startEdit(absence: Absence) {
    setEditingId(absence.id);
    setEmployeId(absence.employe_id);
    setType(absence.type);
    setDateDebut(absence.date_debut.slice(0, 10));
    setDateFin(absence.date_fin.slice(0, 10));
    setMotifPrecision(absence.motif_precision ?? "");
    setError(null);
    setReviewPayload(null);
    setChoices({});
    setConflict(null);
    window.requestAnimationFrame(() => {
      document.getElementById("absence-form")?.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
      });
    });
  }

  function validatedPayload(): NewAbsenceInput | null {
    if (!employeId || !dateDebut || !dateFin) {
      setError("Tous les champs sont obligatoires.");
      return null;
    }
    if (dateFin < dateDebut) {
      setError("La date de fin doit être après la date de début.");
      return null;
    }
    if (type === "autre" && !motifPrecision.trim()) {
      setError("Précisez le motif pour une absence de type « Autre ».");
      return null;
    }
    setError(null);
    return {
      employe_id: employeId,
      type,
      date_debut: dateDebut,
      date_fin: dateFin,
      motif_precision: type === "autre" ? motifPrecision.trim() : null,
    };
  }

  async function persistAbsence(
    payload: NewAbsenceInput,
    phaseChoices: Record<string, AbsencePhaseChoice>,
    forceConflict = false,
  ) {
    setSaving(true);
    setError(null);
    try {
      const plan = planAbsenceImprevue(snapshot, payload, phaseChoices, {
        ignoreAbsenceId: editingId ?? undefined,
      });
      if (plan.status === "conflict" && !forceConflict) {
        setConflict(plan);
        return;
      }
      if (editingId) {
        await updateAbsence({ id: editingId, ...payload });
      } else {
        await createAbsence(payload);
      }
      const overlap = listImpactedPhases(
        snapshot,
        payload.employe_id,
        payload.date_debut,
        payload.date_fin,
      );
      if (needsAlgoValidation(plan)) {
        await createSignalement({
          employe_id: payload.employe_id,
          phase_id: overlap[0]?.phase.id ?? plan.patches[0]?.id ?? null,
          retard_demi_journees: 1,
          sens: "retard",
          note: `Absence du ${payload.date_debut} au ${payload.date_fin} : l’algorithme propose des décalages, non appliqués tant que Mika ou Alexis n’a pas validé.`,
          origine: "decalage_admin",
          statut: "en_attente",
          proposition:
            propositionFromSolutions(
              generateDelaySolutions(
                snapshot,
                overlap[0]?.phase.id ?? plan.patches[0]?.id ?? "",
                2,
                plan,
              ),
            ) ?? propositionFromDelay(snapshot, plan),
        });
      } else if (plan.patches.length > 0) {
        await applyPhasePatches(plan.patches);
      }
      resetForm();
    } catch (err) {
      setError(formatSaveError(err, "l’absence n’a pas été enregistrée"));
    } finally {
      setSaving(false);
    }
  }

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    const payload = validatedPayload();
    if (!payload) return;
    const overlap = listImpactedPhases(
      snapshot,
      payload.employe_id,
      payload.date_debut,
      payload.date_fin,
    );
    if (overlap.length > 0) {
      setReviewPayload(payload);
      return;
    }
    await persistAbsence(payload, {});
  }

  const reviewEmployee = reviewPayload
    ? employeesById.get(reviewPayload.employe_id)
    : undefined;

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
      <div>
        <h2 className="font-serif text-3xl text-stone-900">Absences</h2>
        <p className="mt-1 mb-4 text-sm text-stone-600">
          Congés, maladie, formation, jour férié d&apos;entreprise ou autre
          motif justifié.
        </p>
        <div className="overflow-hidden rounded-lg border border-stone-300 bg-white">
          <table className="min-w-full text-sm">
            <thead className="bg-stone-100 text-left">
              <tr>
                <th className="px-3 py-2 font-medium">Employé</th>
                <th className="px-3 py-2 font-medium">Type</th>
                <th className="px-3 py-2 font-medium">Début</th>
                <th className="px-3 py-2 font-medium">Fin</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {snapshot.absences.length === 0 && (
                <tr>
                  <td className="px-3 py-4 text-stone-500" colSpan={5}>
                    Aucune absence enregistrée.
                  </td>
                </tr>
              )}
              {snapshot.absences.map((absence) => (
                <tr
                  key={absence.id}
                  className={`border-t border-stone-200 ${
                    editingId === absence.id ? "bg-amber-50" : ""
                  }`}
                >
                  <td className="px-3 py-2">
                    {employeesById.get(absence.employe_id)?.nom ?? "—"}
                  </td>
                  <td className="px-3 py-2">{absenceLabel(absence)}</td>
                  <td className="px-3 py-2">
                    {formatLongDate(absence.date_debut)}
                  </td>
                  <td className="px-3 py-2">{formatLongDate(absence.date_fin)}</td>
                  <td className="px-3 py-2 text-right">
                    <button
                      type="button"
                      className="mr-3 text-amber-800"
                      onClick={() => startEdit(absence)}
                    >
                      Modifier
                    </button>
                    <button
                      type="button"
                      className="text-red-700"
                      onClick={() => {
                        if (editingId === absence.id) resetForm();
                        void deleteAbsence(absence.id).catch((err) => {
                          setError(
                            formatSaveError(err, "l’absence n’a pas été supprimée"),
                          );
                        });
                      }}
                    >
                      Supprimer
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <form
        id="absence-form"
        onSubmit={(event) => void onSubmit(event)}
        className="h-fit space-y-3 rounded-lg border border-stone-300 bg-white p-4"
      >
        <h3 className="font-medium">
          {editingId ? "Modifier l’absence" : "Ajouter une absence"}
        </h3>
        {error && !reviewPayload && <p className="text-sm text-red-700">{error}</p>}
        <label className="block text-sm">
          <span className="mb-1 block">Employé</span>
          <select
            value={employeId}
            onChange={(event) => setEmployeId(event.target.value)}
            className="w-full rounded border border-stone-300 px-3 py-2"
          >
            <option value="">Choisir…</option>
            {snapshot.employees
              .filter((employee) => employee.actif || employee.id === employeId)
              .sort(compareEmployeesByOrdre)
              .map((employee) => (
                <option key={employee.id} value={employee.id}>
                  {employee.nom}
                </option>
              ))}
          </select>
        </label>
        <label className="block text-sm">
          <span className="mb-1 block">Type</span>
          <select
            value={type}
            onChange={(event) => setType(event.target.value as TypeAbsence)}
            className="w-full rounded border border-stone-300 px-3 py-2"
          >
            {TYPES_ABSENCE.map((value) => (
              <option key={value} value={value}>
                {ABSENCE_LABELS[value]}
              </option>
            ))}
          </select>
        </label>
        {type === "autre" && (
          <label className="block text-sm">
            <span className="mb-1 block">Préciser le motif</span>
            <input
              value={motifPrecision}
              onChange={(event) => setMotifPrecision(event.target.value)}
              placeholder="Ex. rendez-vous administratif…"
              className="w-full rounded border border-stone-300 px-3 py-2"
            />
          </label>
        )}
        <label className="block text-sm">
          <span className="mb-1 block">Début</span>
          <input
            type="date"
            value={dateDebut}
            onChange={(event) => setDateDebut(event.target.value)}
            className="w-full rounded border border-stone-300 px-3 py-2"
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block">Fin</span>
          <input
            type="date"
            value={dateFin}
            onChange={(event) => setDateFin(event.target.value)}
            className="w-full rounded border border-stone-300 px-3 py-2"
          />
        </label>
        <div className="flex gap-2">
          <button
            type="submit"
            disabled={saving}
            className="rounded bg-amber-700 px-3 py-2 text-sm text-amber-50 disabled:opacity-60"
          >
            {editingId ? "Enregistrer les modifications" : "Enregistrer"}
          </button>
          {editingId ? (
            <button
              type="button"
              onClick={resetForm}
              className="rounded border border-stone-300 px-3 py-2 text-sm"
            >
              Annuler
            </button>
          ) : null}
        </div>
      </form>

      {reviewPayload && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/50 p-4">
          <div className="max-h-[90vh] w-full max-w-xl overflow-auto rounded-xl bg-white p-5 shadow-xl">
            <h3 className="font-serif text-2xl text-stone-900">
              Conflit avec des chantiers planifiés
            </h3>
            <p className="mt-2 text-sm text-stone-600">
              {reviewEmployee?.nom ?? "Ce salarié"} a déjà des phases de chantier
              sur {formatLongDate(reviewPayload.date_debut)}
              {reviewPayload.date_fin !== reviewPayload.date_debut
                ? ` → ${formatLongDate(reviewPayload.date_fin)}`
                : ""}{" "}
              ({absenceLabel(reviewPayload)}). Annulez l’absence, ou confirmez-la
              : les chantiers concernés seront recalés (décalage ou
              réassignation).
            </p>
            <div className="mt-4">
              <AbsenceImpactEditor
                impacted={impacted}
                candidates={candidates}
                choices={choices}
                onChange={setChoices}
              />
            </div>
            {error && <p className="mt-3 text-sm text-red-700">{error}</p>}
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                disabled={saving}
                className="rounded-lg bg-stone-900 px-4 py-2 text-sm text-white disabled:opacity-60"
                onClick={() => void persistAbsence(reviewPayload, choices)}
              >
                {saving ? "Enregistrement…" : "Confirmer l’absence et recaler"}
              </button>
              <button
                type="button"
                disabled={saving}
                className="rounded-lg border border-stone-300 px-4 py-2 text-sm"
                onClick={() => {
                  setReviewPayload(null);
                  setChoices({});
                  setConflict(null);
                  setError(null);
                }}
              >
                Annuler l’absence
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
          validateLabel="Envoyer pour validation"
          adjustLabel="Annuler"
          onValidate={() => {
            const payload = reviewPayload;
            setConflict(null);
            if (payload) void persistAbsence(payload, choices, true);
          }}
          onAdjust={() => setConflict(null)}
          onCancel={() => setConflict(null)}
        />
      )}
    </div>
  );
}
