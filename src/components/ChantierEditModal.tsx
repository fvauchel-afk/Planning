"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { BonCommandeModal } from "@/components/BonCommandeModal";
import { canGenerateBonCommande } from "@/lib/bon-commande/active-phase";
import { chantierVisibleOnGrid } from "@/lib/calendar";
import { estimativePhaseIdsForChantier } from "@/lib/dates-estimatives";
import {
  STATUT_CHANTIER_LABELS,
  chantierPlanningInfo,
} from "@/lib/chantier-status";
import { addDays, calendarDaysBetween, toISODate } from "@/lib/dates";
import {
  isEmptyPhaseEdits,
  planChantierDateEdits,
} from "@/lib/engine/resize-chantier";
import { compareEmployeesByOrdre } from "@/lib/display-order";
import { usePlanning } from "@/lib/planning-context";
import {
  LOGISTIQUE_ROW_ID,
  PRIORITES,
  PRIORITE_LABELS,
  type Chantier,
  type Priorite,
} from "@/lib/types";

const DELETE_CONFIRM =
  "Êtes-vous sûr ? Cette action est irréversible et supprimera aussi toutes les phases planifiées liées.";

function onedriveHref(raw: string): string | null {
  const value = raw.trim();
  if (!value) return null;
  if (/^https?:\/\//i.test(value)) return value;
  if (/^[a-z][a-z0-9+.-]*:/i.test(value)) return null;
  return `https://${value}`;
}

export function ChantierEditModal({
  chantier,
  onClose,
}: {
  chantier: Chantier;
  onClose: () => void;
}) {
  const router = useRouter();
  const {
    snapshot,
    updateChantier,
    deleteChantier,
    scheduleChantierDay,
    applyPhaseEdits,
    confirmPhaseDates,
  } = usePlanning();
  const [nomClient, setNomClient] = useState(chantier.nom_client);
  const [adresse, setAdresse] = useState(chantier.adresse);
  const [lien, setLien] = useState(chantier.lien_dossier_onedrive ?? "");
  const [priorite, setPriorite] = useState<Priorite>(chantier.priorite);
  const [saving, setSaving] = useState(false);
  const [scheduling, setScheduling] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [planDate, setPlanDate] = useState(toISODate(new Date()));
  const [planEnd, setPlanEnd] = useState(toISODate(new Date()));
  const [planEmployeeId, setPlanEmployeeId] = useState("");
  const [datesEstimatives, setDatesEstimatives] = useState(
    Boolean(chantier.dates_estimatives),
  );
  const [error, setError] = useState<string | null>(null);
  const [bonCommande, setBonCommande] = useState(false);

  const info = useMemo(
    () => chantierPlanningInfo(snapshot, chantier.id),
    [snapshot, chantier.id],
  );
  const isPlanned = Boolean(info.firstDate && info.lastDate);
  const visibleOnGrid = useMemo(
    () => chantierVisibleOnGrid(snapshot, chantier.id),
    [snapshot, chantier.id],
  );

  const activeEmployees = useMemo(
    () =>
      snapshot.employees
        .filter((employee) => employee.actif && employee.id !== LOGISTIQUE_ROW_ID)
        .sort(compareEmployeesByOrdre),
    [snapshot.employees],
  );

  useEffect(() => {
    setNomClient(chantier.nom_client);
    setAdresse(chantier.adresse);
    setLien(chantier.lien_dossier_onedrive ?? "");
    setPriorite(chantier.priorite);
    setDatesEstimatives(Boolean(info.estimatif));
    setError(null);
  }, [chantier, info.estimatif]);

  useEffect(() => {
    setPlanDate(info.firstDate ?? toISODate(new Date()));
    setPlanEnd(info.lastDate ?? info.firstDate ?? toISODate(new Date()));
  }, [chantier.id, info.firstDate, info.lastDate]);

  useEffect(() => {
    if (!planEmployeeId && activeEmployees[0]) {
      setPlanEmployeeId(activeEmployees[0].id);
    }
  }, [activeEmployees, planEmployeeId]);

  const onedriveUrl = onedriveHref(lien || chantier.lien_dossier_onedrive || "");
  const busy = saving || scheduling || deleting;

  function onChangeStart(next: string) {
    if (planDate && planEnd) {
      setPlanEnd(addDays(planEnd, calendarDaysBetween(planDate, next)));
    }
    setPlanDate(next);
  }

  async function persistPlanning(forceCreate: boolean) {
    if (!planDate) {
      throw new Error("Choisissez une date de début.");
    }
    if (visibleOnGrid) {
      const edits = planChantierDateEdits(
        snapshot,
        chantier.id,
        planDate,
        planEnd || planDate,
      );
      if (!isEmptyPhaseEdits(edits)) await applyPhaseEdits(edits);
      return;
    }
    if (!forceCreate && !isPlanned) return;
    if (!planEmployeeId) {
      throw new Error("Choisissez un salarié.");
    }
    await scheduleChantierDay({
      chantierId: chantier.id,
      date: planDate,
      dateFin: planEnd || planDate,
      employeeId: planEmployeeId,
    });
  }

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!nomClient.trim()) {
      setError("Le nom du client est obligatoire.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const startBefore = info.firstDate ?? "";
      const endBefore = info.lastDate ?? info.firstDate ?? "";
      const datesChanged =
        visibleOnGrid &&
        (planDate !== startBefore || (planEnd || planDate) !== endBefore);
      await persistPlanning(false);
      const confirmIds = estimativePhaseIdsForChantier(snapshot, chantier.id);
      const confirmNow = (datesChanged || !datesEstimatives) && confirmIds.length > 0;
      if (confirmNow) {
        await confirmPhaseDates(confirmIds);
      }
      await updateChantier({
        id: chantier.id,
        nom_client: nomClient.trim(),
        adresse: adresse.trim(),
        priorite,
        lien_dossier_onedrive: lien.trim() || null,
        dates_estimatives: confirmNow ? false : datesEstimatives,
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Enregistrement impossible.");
    } finally {
      setSaving(false);
    }
  }

  async function onPlanifier() {
    setScheduling(true);
    setError(null);
    try {
      await persistPlanning(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Planification impossible.");
    } finally {
      setScheduling(false);
    }
  }

  async function onDelete() {
    if (!window.confirm(DELETE_CONFIRM)) return;
    setDeleting(true);
    setError(null);
    try {
      await deleteChantier(chantier.id);
      onClose();
      router.push("/chantiers");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Suppression impossible.");
      setDeleting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/50 p-4">
      <form
        onSubmit={(event) => void onSubmit(event)}
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl bg-white p-5 shadow-xl"
      >
        <h3 className="font-serif text-xl text-stone-900">Modifier le chantier</h3>
        <p className="mt-1 text-sm text-stone-500">
          {STATUT_CHANTIER_LABELS[info.statut]}
          {info.rangeLabel ? ` · ${info.rangeLabel}` : ""}
          {datesEstimatives ? " · Estimatif" : ""}
        </p>
        <div className="mt-4 space-y-3">
          <label className="block text-sm">
            <span className="mb-1 block">Nom</span>
            <input
              value={nomClient}
              onChange={(event) => setNomClient(event.target.value)}
              className="w-full rounded border border-stone-300 px-3 py-2"
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block">Adresse</span>
            <input
              value={adresse}
              onChange={(event) => setAdresse(event.target.value)}
              className="w-full rounded border border-stone-300 px-3 py-2"
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block">Priorité</span>
            <select
              value={priorite}
              onChange={(event) => setPriorite(event.target.value as Priorite)}
              className="w-full rounded border border-stone-300 px-3 py-2"
            >
              {PRIORITES.map((value) => (
                <option key={value} value={value}>
                  {PRIORITE_LABELS[value]}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            <span className="mb-1 block">Lien dossier OneDrive</span>
            <input
              value={lien}
              onChange={(event) => setLien(event.target.value)}
              className="w-full rounded border border-stone-300 px-3 py-2"
            />
          </label>
          {onedriveUrl ? (
            <a
              href={onedriveUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex w-full items-center justify-center rounded border border-sky-700 bg-sky-50 px-3 py-2 text-sm font-medium text-sky-800 hover:bg-sky-100"
            >
              Ouvrir le dossier OneDrive
            </a>
          ) : null}

          <fieldset className="rounded-lg border border-amber-200 bg-amber-50/50 p-3">
            <legend className="px-1 text-sm font-medium text-stone-800">
              Dates planifiées
              {datesEstimatives ? (
                <span className="ml-2 rounded border border-dashed border-violet-400 bg-violet-50 px-1.5 py-px text-[10px] font-semibold uppercase tracking-wide text-violet-800">
                  Estimatif
                </span>
              ) : null}
            </legend>
            {isPlanned && !visibleOnGrid ? (
              <p className="mt-1 text-xs text-red-800">
                Des dates sont enregistrées mais aucun créneau n’apparaît sur le
                planning équipe (phase sans salarié ou sans durée). Choisissez un
                salarié puis Planifier / Enregistrer.
              </p>
            ) : null}
            <label className="mt-2 block text-sm">
              <span className="mb-1 block">Date de début</span>
              <input
                type="date"
                value={planDate}
                onChange={(event) => onChangeStart(event.target.value)}
                className="w-full rounded border border-stone-300 bg-white px-3 py-2"
              />
            </label>
            <label className="mt-2 block text-sm">
              <span className="mb-1 block">Date de fin</span>
              <input
                type="date"
                value={planEnd}
                onChange={(event) => setPlanEnd(event.target.value)}
                className="w-full rounded border border-stone-300 bg-white px-3 py-2"
                min={planDate || undefined}
              />
            </label>
            <div className="mt-3 flex flex-wrap gap-4 text-sm">
              <label className="inline-flex items-center gap-2">
                <input
                  type="radio"
                  name="edit-dates-kind"
                  checked={datesEstimatives}
                  onChange={() => setDatesEstimatives(true)}
                />
                Estimatif
              </label>
              <label className="inline-flex items-center gap-2">
                <input
                  type="radio"
                  name="edit-dates-kind"
                  checked={!datesEstimatives}
                  onChange={() => setDatesEstimatives(false)}
                />
                Confirmé
              </label>
            </div>
            <p className="mt-2 text-xs text-stone-500">
              Modifier le début ou la fin confirme les dates. Un chantier déjà
              commencé, un bon de commande, ou « Je valide le lancement » aussi.
            </p>
            {visibleOnGrid ? (
              <p className="mt-2 text-xs text-stone-500">
                Modifier le début décale toutes les phases. Modifier la fin ajoute
                ou retire les jours ouvrés (mêmes salariés et horaires que le
                dernier jour, samedi et dimanche exclus). Enregistrez pour
                appliquer.
              </p>
            ) : (
              <>
                <label className="mt-2 block text-sm">
                  <span className="mb-1 block">Salarié</span>
                  <select
                    value={planEmployeeId}
                    onChange={(event) => setPlanEmployeeId(event.target.value)}
                    className="w-full rounded border border-stone-300 bg-white px-3 py-2"
                  >
                    {activeEmployees.length === 0 ? (
                      <option value="">Aucun salarié actif</option>
                    ) : (
                      activeEmployees.map((employee) => (
                        <option key={employee.id} value={employee.id}>
                          {employee.nom}
                        </option>
                      ))
                    )}
                  </select>
                </label>
                <button
                  type="button"
                  disabled={busy || !planEmployeeId}
                  onClick={() => void onPlanifier()}
                  className="mt-3 rounded bg-amber-700 px-3 py-2 text-sm text-amber-50 disabled:opacity-60"
                >
                  {scheduling ? "Planification…" : "Planifier"}
                </button>
              </>
            )}
          </fieldset>
        </div>
        {error && <p className="mt-3 text-sm text-red-700">{error}</p>}
        {canGenerateBonCommande(snapshot, chantier.id) ? (
          <button
            type="button"
            className="mt-4 w-full rounded-lg bg-amber-800 px-3 py-2 text-sm text-amber-50"
            onClick={() => setBonCommande(true)}
          >
            Générer un bon de commande
          </button>
        ) : null}
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded border border-stone-300 px-3 py-2 text-sm"
          >
            Annuler
          </button>
          <button
            type="submit"
            disabled={busy}
            className="rounded bg-amber-700 px-3 py-2 text-sm text-amber-50 disabled:opacity-60"
          >
            {saving ? "Enregistrement…" : "Enregistrer"}
          </button>
        </div>
        <div className="mt-6 border-t border-stone-200 pt-4">
          <button
            type="button"
            disabled={busy}
            onClick={() => void onDelete()}
            className="w-full rounded border border-red-700 bg-red-600 px-3 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-60"
          >
            {deleting ? "Suppression…" : "Supprimer ce chantier"}
          </button>
        </div>
      </form>
      {bonCommande ? (
        <BonCommandeModal
          chantierId={chantier.id}
          onClose={() => setBonCommande(false)}
        />
      ) : null}
    </div>
  );
}
