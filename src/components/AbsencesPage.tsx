"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { AbsenceImpactEditor } from "@/components/AbsenceImpactEditor";
import { FormNotice } from "@/components/FormNotice";
import { ConflictModal } from "@/components/ConflictModal";
import { ModalFrame } from "@/components/ModalFrame";
import { formatLongDate } from "@/lib/dates";
import { compareEmployeesByOrdre } from "@/lib/display-order";
import {
  candidatesForChoices,
  defaultAbsenceChoices,
  listImpactedPhases,
  planAbsenceImprevue,
  type AbsencePhaseChoice,
} from "@/lib/engine/absence-imprevue";
import { delayTouchesPrioritaire } from "@/lib/engine/delay";
import { usePlanning } from "@/lib/planning-context";
import {
  STALE_ABSENCE_MESSAGE,
  absenceCascadeFingerprint,
  confirmStaleReload,
  useDebouncedPatch,
} from "@/lib/form-live";
import {
  clearFormDraft,
  readFormDraft,
  setUnsavedWork,
  useFlushFormDraft,
  useFormDraftReopen,
  writeFormDraft,
} from "@/lib/form-draft";
import { payloadForAbsenceValidation } from "@/lib/absence-validate";
import {
  absencePeriodNote,
  matchingRecordedAbsence,
  propositionFromDelay,
  similarAbsenceSignalement,
  similarPendingAbsenceSignalement,
} from "@/lib/signalements";
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
  const pathname = usePathname();
  const { reopen, clearReopen } = useFormDraftReopen();
  const {
    snapshot,
    createAbsence,
    updateAbsence,
    patchAbsence,
    deleteAbsence,
    applyPhasePatches,
    createSignalement,
    refresh,
  } = usePlanning();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [employeId, setEmployeId] = useState("");
  const [type, setType] = useState<TypeAbsence>("conge");
  const [dateDebut, setDateDebut] = useState("");
  const [dateFin, setDateFin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [motifPrecision, setMotifPrecision] = useState("");
  const [applyToTeam, setApplyToTeam] = useState(false);
  const [reviewPayload, setReviewPayload] = useState<NewAbsenceInput | null>(null);
  const [choices, setChoices] = useState<Record<string, AbsencePhaseChoice>>({});
  const [saving, setSaving] = useState(false);
  const [conflict, setConflict] = useState<ReturnType<typeof planAbsenceImprevue> | null>(
    null,
  );
  const snapRef = useRef(snapshot);
  snapRef.current = snapshot;
  const dirtySimple = useRef(new Set<string>());
  const cascadeBaseline = useRef("");
  const cascadeDirty = useRef(false);
  const unsavedKey = editingId ? `absence:${editingId}` : "absence:new";

  const applyAbsencePatch = async (payload: {
    type?: TypeAbsence;
    motif_precision?: string | null;
  }) => {
    if (!editingId) return;
    try {
      await patchAbsence({ id: editingId, ...payload });
      Object.keys(payload).forEach((key) => dirtySimple.current.delete(key));
    } catch (err) {
      setError(formatSaveError(err, "l’enregistrement automatique a échoué"));
    }
  };
  const live = useDebouncedPatch(applyAbsencePatch);

  const listedAbsences = useMemo(() => {
    return [...snapshot.absences].sort((left, right) => {
      const byStart = right.date_debut.localeCompare(left.date_debut);
      if (byStart !== 0) return byStart;
      const byEnd = right.date_fin.localeCompare(left.date_fin);
      if (byEnd !== 0) return byEnd;
      return right.id.localeCompare(left.id);
    });
  }, [snapshot.absences]);

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

  function markAbsenceCascade() {
    cascadeDirty.current = true;
    setUnsavedWork(unsavedKey, true);
  }

  function resetForm() {
    live.cancel();
    dirtySimple.current.clear();
    cascadeDirty.current = false;
    cascadeBaseline.current = "";
    setUnsavedWork(unsavedKey, false);
    if (editingId) clearFormDraft("absence", editingId);
    setEditingId(null);
    setEmployeId("");
    setType("conge");
    setDateDebut("");
    setDateFin("");
    setMotifPrecision("");
    setApplyToTeam(false);
    setError(null);
    setReviewPayload(null);
    setChoices({});
    setConflict(null);
  }

  function startEdit(absence: Absence) {
    live.cancel();
    dirtySimple.current.clear();
    cascadeDirty.current = false;
    cascadeBaseline.current = absenceCascadeFingerprint(absence);
    setEditingId(absence.id);
    setEmployeId(absence.employe_id);
    setType(absence.type);
    setDateDebut(absence.date_debut.slice(0, 10));
    setDateFin(absence.date_fin.slice(0, 10));
    setMotifPrecision(absence.motif_precision ?? "");
    setError(null);
    setNotice(null);
    setReviewPayload(null);
    setChoices({});
    setConflict(null);
    const draft = readFormDraft();
    if (draft?.kind === "absence" && draft.id === absence.id) {
      setEmployeId(draft.employeId);
      setDateDebut(draft.dateDebut);
      setDateFin(draft.dateFin);
      cascadeDirty.current = true;
      setUnsavedWork(`absence:${absence.id}`, true);
    }
    window.requestAnimationFrame(() => {
      document.getElementById("absence-form")?.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
      });
    });
  }

  useEffect(() => {
    if (reopen?.kind !== "absence") return;
    const found = snapshot.absences.find((item) => item.id === reopen.id);
    if (found) startEdit(found);
    clearReopen();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- ouvrir une seule fois le brouillon
  }, [reopen, snapshot.absences, clearReopen]);

  const persistDraft = useCallback(() => {
    if (!editingId) return;
    writeFormDraft({
      kind: "absence",
      id: editingId,
      path: pathname || "/absences",
      employeId,
      dateDebut,
      dateFin,
    });
  }, [pathname, editingId, employeId, dateDebut, dateFin]);

  useFlushFormDraft(persistDraft);

  useEffect(() => {
    if (!cascadeDirty.current) return;
    persistDraft();
  }, [persistDraft]);

  useEffect(
    () => () => {
      setUnsavedWork(unsavedKey, false);
    },
    [unsavedKey],
  );

  useEffect(() => {
    if (!editingId) return;
    const remote = snapshot.absences.find((item) => item.id === editingId);
    if (!remote) return;
    if (!dirtySimple.current.has("type")) setType(remote.type);
    if (!dirtySimple.current.has("motif_precision")) {
      setMotifPrecision(remote.motif_precision ?? "");
    }
    if (!cascadeDirty.current) {
      setEmployeId(remote.employe_id);
      setDateDebut(remote.date_debut.slice(0, 10));
      setDateFin(remote.date_fin.slice(0, 10));
      cascadeBaseline.current = absenceCascadeFingerprint(remote);
    }
  }, [snapshot, editingId]);

  function validatedPayload(): NewAbsenceInput | null {
    if (!applyToTeam && !employeId) {
      setError("Tous les champs sont obligatoires.");
      return null;
    }
    if (applyToTeam && type !== "ferie_entreprise") {
      setError(
        "« Appliquer à toute l’équipe » n’est disponible que pour un jour férié entreprise.",
      );
      return null;
    }
    if (!dateDebut || !dateFin) {
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
      employe_id: applyToTeam ? "" : employeId,
      type,
      date_debut: dateDebut,
      date_fin: dateFin,
      motif_precision: type === "autre" ? motifPrecision.trim() : null,
    };
  }

  async function persistTeamFerie(base: NewAbsenceInput) {
    const team = snapRef.current.employees.filter((employee) => employee.actif);
    if (team.length === 0) {
      setError("Aucun salarié actif.");
      return;
    }
    setSaving(true);
    setError(null);
    let created = 0;
    let skipped = 0;
    let signalements = 0;
    try {
      let snap = snapRef.current;
      for (const employee of team) {
        const payload: NewAbsenceInput = {
          ...base,
          employe_id: employee.id,
        };
        if (matchingRecordedAbsence(snap, payload)) {
          skipped += 1;
          continue;
        }
        await createAbsence(payload);
        created += 1;
        snap = (await refresh({ throwOnError: true })) ?? snapRef.current;
        snapRef.current = snap;
        const overlap = listImpactedPhases(
          snap,
          payload.employe_id,
          payload.date_debut,
          payload.date_fin,
        );
        if (overlap.length === 0) continue;
        const nextChoices = defaultAbsenceChoices(snap, overlap, {});
        const plan = planAbsenceImprevue(snap, payload, nextChoices);
        const needsPlacementConflict =
          plan.status === "conflict" ||
          delayTouchesPrioritaire(snap, plan.patches);
        if (needsPlacementConflict) {
          const originPhaseId =
            overlap[0]?.phase.id ?? plan.patches[0]?.id ?? "";
          await createSignalement({
            employe_id: payload.employe_id,
            phase_id: originPhaseId || null,
            retard_demi_journees: 1,
            sens: "retard",
            note: `${absencePeriodNote(payload)} : jour férié équipe — décalages à valider.`,
            origine: "decalage_admin",
            statut: "en_attente",
            proposition: propositionFromDelay(snap, plan),
          });
          signalements += 1;
          continue;
        }
        if (plan.patches.length > 0) {
          await applyPhasePatches(plan.patches);
          snap = (await refresh({ throwOnError: true })) ?? snapRef.current;
          snapRef.current = snap;
        }
      }
      setNotice(
        `${created} absence${created > 1 ? "s" : ""} « Jour férié entreprise » créée${created > 1 ? "s" : ""} pour l’équipe${
          skipped ? ` (${skipped} déjà en place)` : ""
        }${
          signalements
            ? ` — ${signalements} signalement${signalements > 1 ? "s" : ""} à valider sur Signalements`
            : ""
        }.`,
      );
      resetForm();
    } catch (err) {
      setError(
        formatSaveError(err, "le jour férié n’a pas été appliqué à toute l’équipe"),
      );
    } finally {
      setSaving(false);
    }
  }

  async function persistAbsence(
    payload: NewAbsenceInput,
    phaseChoices: Record<string, AbsencePhaseChoice>,
    forceConflict = false,
  ) {
    setSaving(true);
    setError(null);
    let sendingValidation = false;
    try {
      const plan =
        forceConflict && conflict
          ? conflict
          : planAbsenceImprevue(snapRef.current, payload, phaseChoices, {
              ignoreAbsenceId: editingId ?? undefined,
            });
      const needsPlacementConflict =
        plan.status === "conflict" ||
        delayTouchesPrioritaire(snapRef.current, plan.patches);
      sendingValidation = Boolean(needsPlacementConflict && forceConflict);
      if (needsPlacementConflict && !forceConflict) {
        setConflict(plan);
        return;
      }
      const overlapSource = editingId
        ? {
            ...snapRef.current,
            absences: snapRef.current.absences.filter(
              (item) => item.id !== editingId,
            ),
          }
        : snapRef.current;
      const overlap = listImpactedPhases(
        overlapSource,
        payload.employe_id,
        payload.date_debut,
        payload.date_fin,
      );
      if (needsPlacementConflict) {
        const pendingSimilar = similarPendingAbsenceSignalement(
          snapRef.current,
          payload,
        );
        if (pendingSimilar) {
          setNotice(
            "Un signalement similaire est déjà en attente. Rien de plus n’a été envoyé — ouvrez Signalements pour le traiter.",
          );
          resetForm();
          return;
        }
        const already = matchingRecordedAbsence(
          snapRef.current,
          payload,
          editingId ?? undefined,
        );
        if (editingId) {
          await updateAbsence({ id: editingId, ...payload });
        } else if (!already) {
          await createAbsence(payload);
        }
        const previouslyRejected = similarAbsenceSignalement(snapRef.current, payload, [
          "rejete",
        ]);
        const originPhaseId =
          overlap[0]?.phase.id ?? plan.patches[0]?.id ?? "";
        await createSignalement({
          employe_id: payload.employe_id,
          phase_id: originPhaseId || null,
          retard_demi_journees: 1,
          sens: "retard",
          note: `${absencePeriodNote(payload)} : l’algorithme propose des décalages, non appliqués tant que Mika ou Alexis n’a pas validé.`,
          origine: "decalage_admin",
          statut: "en_attente",
          proposition: propositionFromDelay(snapRef.current, plan),
        });
        setNotice(
          previouslyRejected
            ? "Signalement renvoyé. Le précédent pour ces dates avait été rejeté ; ouvrez Signalements pour le traiter."
            : "Signalement envoyé. L’absence est enregistrée ; les décalages de chantier attendront la validation sur Signalements.",
        );
        resetForm();
        return;
      }
      if (editingId) {
        await updateAbsence({ id: editingId, ...payload });
      } else {
        await createAbsence(payload);
      }
      if (plan.patches.length > 0) {
        await applyPhasePatches(plan.patches);
      }
      setNotice("Absence enregistrée.");
      resetForm();
    } catch (err) {
      setError(
        formatSaveError(
          err,
          sendingValidation
            ? "l’envoi pour validation n’a pas abouti"
            : "l’absence n’a pas été enregistrée",
        ),
      );
    } finally {
      setSaving(false);
    }
  }

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    const payload = validatedPayload();
    if (!payload) return;
    setNotice(null);
    if (applyToTeam && !editingId && payload.type === "ferie_entreprise") {
      await persistTeamFerie(payload);
      return;
    }
    if (editingId) {
      await live.flush();
      const latest = (await refresh({ quiet: true })) ?? snapshot;
      snapRef.current = latest;
      const remote = latest.absences.find((item) => item.id === editingId);
      const remoteFp = absenceCascadeFingerprint(remote);
      if (
        cascadeDirty.current &&
        remoteFp &&
        remoteFp !== cascadeBaseline.current
      ) {
        if (confirmStaleReload(STALE_ABSENCE_MESSAGE)) {
          if (remote) {
            cascadeDirty.current = false;
            setEmployeId(remote.employe_id);
            setDateDebut(remote.date_debut.slice(0, 10));
            setDateFin(remote.date_fin.slice(0, 10));
            cascadeBaseline.current = remoteFp;
          }
        }
        return;
      }
    }
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
          motif justifié. Type et motif s’enregistrent tout seuls sur une fiche
          déjà ouverte ; les dates et le salarié s’appliquent avec Enregistrer.
        </p>
        {notice && (
          <p className="mb-4 rounded border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-950">
            {notice}
          </p>
        )}
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
              {listedAbsences.length === 0 && (
                <tr>
                  <td className="px-3 py-4 text-stone-500" colSpan={5}>
                    Aucune absence enregistrée.
                  </td>
                </tr>
              )}
              {listedAbsences.map((absence) => (
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
        {error && !reviewPayload ? <FormNotice>{error}</FormNotice> : null}
        <label className="block text-sm">
          <span className="mb-1 block">Employé</span>
          <select
            value={employeId}
            disabled={applyToTeam && type === "ferie_entreprise"}
            onChange={(event) => {
              markAbsenceCascade();
              setEmployeId(event.target.value);
            }}
            className="w-full rounded border border-stone-300 px-3 py-2 disabled:bg-stone-100"
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
            onChange={(event) => {
              const value = event.target.value as TypeAbsence;
              setType(value);
              if (value !== "ferie_entreprise") setApplyToTeam(false);
              dirtySimple.current.add("type");
              if (editingId) {
                live.schedule({
                  type: value,
                  motif_precision:
                    value === "autre" ? motifPrecision.trim() || null : null,
                });
              }
            }}
            onBlur={() => {
              if (editingId) void live.flush();
            }}
            className="w-full rounded border border-stone-300 px-3 py-2"
          >
            {TYPES_ABSENCE.map((value) => (
              <option key={value} value={value}>
                {ABSENCE_LABELS[value]}
              </option>
            ))}
          </select>
        </label>
        {type === "ferie_entreprise" && !editingId ? (
          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              className="mt-1"
              checked={applyToTeam}
              onChange={(event) => setApplyToTeam(event.target.checked)}
            />
            <span>
              Appliquer à toute l’équipe
              <span className="mt-0.5 block text-xs text-stone-500">
                Crée le jour férié pour tous les salariés actifs, en une fois.
              </span>
            </span>
          </label>
        ) : null}
        {type === "autre" && (
          <label className="block text-sm">
            <span className="mb-1 block">Préciser le motif</span>
            <input
              value={motifPrecision}
              onChange={(event) => {
                const value = event.target.value;
                setMotifPrecision(value);
                dirtySimple.current.add("motif_precision");
                if (editingId) {
                  live.schedule({
                    type: "autre",
                    motif_precision: value.trim() || null,
                  });
                }
              }}
              onBlur={() => {
                if (editingId) void live.flush();
              }}
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
            onChange={(event) => {
              markAbsenceCascade();
              setDateDebut(event.target.value);
            }}
            className="w-full rounded border border-stone-300 px-3 py-2"
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block">Fin</span>
          <input
            type="date"
            value={dateFin}
            onChange={(event) => {
              markAbsenceCascade();
              setDateFin(event.target.value);
            }}
            className="w-full rounded border border-stone-300 px-3 py-2"
          />
        </label>
        <div className="flex gap-2">
          <button
            type="submit"
            disabled={saving}
            className="rounded bg-amber-700 px-3 py-2 text-sm text-amber-50 disabled:opacity-60"
          >
            {editingId
              ? "Enregistrer les modifications"
              : applyToTeam && type === "ferie_entreprise"
                ? "Enregistrer pour toute l’équipe"
                : "Enregistrer"}
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
        <ModalFrame
          onClose={() => {
            setReviewPayload(null);
            setChoices({});
            setConflict(null);
            setError(null);
          }}
          maxWidthClass="max-w-xl"
        >
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
            {error ? <FormNotice className="mt-3">{error}</FormNotice> : null}
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
        </ModalFrame>
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
          error={error}
          busy={saving}
          onValidate={() => {
            const payload = payloadForAbsenceValidation(
              reviewPayload,
              validatedPayload(),
            );
            if (!payload) return;
            void persistAbsence(payload, choices, true);
          }}
          onAdjust={() => {
            setConflict(null);
            setError(null);
          }}
          onCancel={() => {
            setConflict(null);
            setError(null);
          }}
        />
      )}
    </div>
  );
}
