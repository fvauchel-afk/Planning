"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { BonCommandeModal } from "@/components/BonCommandeModal";
import { SousTraitantSelect } from "@/components/SousTraitantSelect";
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
  mergePhaseEdits,
  planChantierDateEdits,
  previewPhaseEdits,
} from "@/lib/engine/resize-chantier";
import {
  chantierPhaseOptions,
  missingGridAssignee,
  planChantierOptionEdits,
} from "@/lib/engine/phase-chain";
import { employeeCanTakePhase } from "@/lib/chantier-status";
import { compareEmployeesByOrdre } from "@/lib/display-order";
import { moisToToleranceJours, toleranceJoursToMois } from "@/lib/priorite";
import { usePlanning } from "@/lib/planning-context";
import { formatSaveError } from "@/lib/supabase/errors";
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
    ensureChantierOnedriveFolder,
  } = usePlanning();
  const [nomClient, setNomClient] = useState(chantier.nom_client);
  const [adresse, setAdresse] = useState(chantier.adresse);
  const [lien, setLien] = useState(chantier.lien_dossier_onedrive ?? "");
  const [priorite, setPriorite] = useState<Priorite>(chantier.priorite);
  const [toleranceMois, setToleranceMois] = useState(
    toleranceJoursToMois(chantier.tolerance_deplacement_jours),
  );
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
  const [creatingFolder, setCreatingFolder] = useState(false);
  const currentOptions = useMemo(
    () => chantierPhaseOptions(snapshot, chantier.id),
    [snapshot, chantier.id],
  );
  const [avecPose, setAvecPose] = useState(currentOptions.avecPose);
  const [avecThermolaquage, setAvecThermolaquage] = useState(
    currentOptions.avecThermolaquage,
  );
  const [delaiLaquage, setDelaiLaquage] = useState(
    String(chantier.delai_sous_traitance_jours || 5),
  );
  const [bonCommande, setBonCommande] = useState(false);
  const [sousTraitantId, setSousTraitantId] = useState(
    chantier.sous_traitant_id ?? "",
  );
  const [avecLivraison, setAvecLivraison] = useState(currentOptions.avecLivraison);
  const [adresseLivraison, setAdresseLivraison] = useState(
    chantier.adresse_livraison ?? "",
  );
  const [telephoneLivraison, setTelephoneLivraison] = useState(
    chantier.telephone_livraison ?? "",
  );
  const [dureeLivraison, setDureeLivraison] = useState("2");
  const [employeLivraison, setEmployeLivraison] = useState("");
  const [employeFabrication, setEmployeFabrication] = useState("");
  const [employePose, setEmployePose] = useState("");

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
    setToleranceMois(toleranceJoursToMois(chantier.tolerance_deplacement_jours));
    setDatesEstimatives(Boolean(info.estimatif));
    setAvecPose(currentOptions.avecPose);
    setAvecThermolaquage(currentOptions.avecThermolaquage);
    setAvecLivraison(currentOptions.avecLivraison);
    setDelaiLaquage(String(chantier.delai_sous_traitance_jours || 5));
    setSousTraitantId(chantier.sous_traitant_id ?? "");
    setAdresseLivraison(chantier.adresse_livraison ?? "");
    setTelephoneLivraison(chantier.telephone_livraison ?? "");
    const liv = snapshot.phases.find((phase) => {
      const element = snapshot.elements.find((item) => item.id === phase.element_id);
      return (
        element?.chantier_id === chantier.id &&
        phase.type_phase === "livraison" &&
        (Boolean(phase.date_debut) || Number(phase.duree_estimee_heures) > 0)
      );
    });
    setDureeLivraison(String(liv?.duree_estimee_heures || 2));
    setEmployeLivraison(liv?.employe_id ?? "");
    const fab = snapshot.phases.find((phase) => {
      const element = snapshot.elements.find((item) => item.id === phase.element_id);
      return element?.chantier_id === chantier.id && phase.type_phase === "fabrication";
    });
    const pose = snapshot.phases.find((phase) => {
      const element = snapshot.elements.find((item) => item.id === phase.element_id);
      return (
        element?.chantier_id === chantier.id &&
        phase.type_phase === "pose" &&
        (Boolean(phase.date_debut) || Number(phase.duree_estimee_heures) > 0)
      );
    });
    setEmployeFabrication(fab?.employe_id ?? "");
    setEmployePose(pose?.employe_id ?? "");
    setError(null);
  }, [chantier, info.estimatif, currentOptions, snapshot]);

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
    if (!visibleOnGrid && (forceCreate || isPlanned)) {
      if (!planEmployeeId) {
        throw new Error("Choisissez un salarié.");
      }
      await scheduleChantierDay({
        chantierId: chantier.id,
        date: planDate,
        dateFin: planEnd || planDate,
        employeeId: planEmployeeId,
      });
      if (forceCreate) return;
    }
    const startBefore = info.firstDate ?? "";
    const endBefore = info.lastDate ?? info.firstDate ?? "";
    const datesChanged =
      visibleOnGrid &&
      (planDate !== startBefore || (planEnd || planDate) !== endBefore);
    const dateEdits = datesChanged
      ? planChantierDateEdits(
          snapshot,
          chantier.id,
          planDate,
          planEnd || planDate,
        )
      : {};
    const preview = previewPhaseEdits(snapshot, dateEdits);
    const optionEdits = planChantierOptionEdits(preview, chantier.id, {
      avecPose,
      avecThermolaquage,
      avecLivraison,
      dureeLivraisonHeures: Number(dureeLivraison || 2),
      employeLivraisonId: employeLivraison || null,
      employeFabricationId: employeFabrication || null,
      employePoseId: employePose || null,
      delayDays: Number(delaiLaquage || 5),
      datesEstimatives,
    });
    const edits = mergePhaseEdits(dateEdits, optionEdits);
    const after = previewPhaseEdits(preview, optionEdits);
    const missing = missingGridAssignee(after, chantier.id);
    if (missing) {
      throw new Error(missing);
    }
    if (!isEmptyPhaseEdits(edits)) await applyPhaseEdits(edits);
  }

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!nomClient.trim()) {
      setError("Le nom du client est obligatoire.");
      return;
    }
    if (avecLivraison) {
      if (!adresseLivraison.trim()) {
        setError("Indiquez l’adresse de livraison.");
        return;
      }
      if (!telephoneLivraison.trim()) {
        setError("Indiquez le téléphone de la personne qui réceptionne.");
        return;
      }
      if (!employeLivraison) {
        setError("Choisissez le salarié responsable de la livraison.");
        return;
      }
      if (!Number(dureeLivraison) || Number(dureeLivraison) <= 0) {
        setError("Indiquez la durée de livraison en heures (ex. 2).");
        return;
      }
    }
    setSaving(true);
    setError(null);
    try {
      const removed: string[] = [];
      if (currentOptions.avecThermolaquage && !avecThermolaquage) {
        removed.push("Thermolaquage / galvanisation");
      }
      if (currentOptions.avecPose && !avecPose) {
        removed.push("Installation / Pose");
      }
      if (currentOptions.avecLivraison && !avecLivraison) {
        removed.push("Livraison");
      }
      if (removed.length > 0) {
        const ok = window.confirm(
          `Supprimer ${removed.join(" et ")} ? Les dates de ${
            removed.length > 1 ? "ces phases" : "cette phase"
          } seront perdues. Cette action est irréversible.`,
        );
        if (!ok) {
          setSaving(false);
          return;
        }
      }
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
        tolerance_deplacement_jours:
          priorite === "pas_presse" ? moisToToleranceJours(toleranceMois) : null,
        lien_dossier_onedrive: lien.trim() || null,
        dates_estimatives: confirmNow ? false : datesEstimatives,
        delai_sous_traitance_jours: avecThermolaquage
          ? Math.min(60, Math.max(1, Number(delaiLaquage || 5)))
          : chantier.delai_sous_traitance_jours ?? 5,
        adresse_livraison: avecLivraison ? adresseLivraison.trim() : null,
        telephone_livraison: avecLivraison ? telephoneLivraison.trim() : null,
        sous_traitant_id: avecThermolaquage ? sousTraitantId || null : null,
      });
      onClose();
    } catch (err) {
      setError(formatSaveError(err, "le chantier n’a pas été enregistré"));
    } finally {
      setSaving(false);
    }
  }

  async function onCreateOnedriveFolder() {
    setCreatingFolder(true);
    setError(null);
    try {
      await ensureChantierOnedriveFolder(chantier.id);
    } catch (err) {
      setError(formatSaveError(err, "le dossier OneDrive n’a pas été créé"));
    } finally {
      setCreatingFolder(false);
    }
  }

  async function onPlanifier() {
    setScheduling(true);
    setError(null);
    try {
      await persistPlanning(true);
    } catch (err) {
      setError(formatSaveError(err, "la planification a échoué"));
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
      setError(formatSaveError(err, "la suppression a échoué"));
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
          {priorite === "pas_presse" ? (
            <label className="block text-sm">
              <span className="mb-1 block">Marge de déplacement</span>
              <select
                value={toleranceMois}
                onChange={(event) => setToleranceMois(Number(event.target.value))}
                className="w-full rounded border border-stone-300 px-3 py-2"
              >
                {[1, 2, 3, 4, 5, 6].map((mois) => (
                  <option key={mois} value={mois}>
                    ± {mois} mois
                  </option>
                ))}
              </select>
            </label>
          ) : null}
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
          ) : (
            <button
              type="button"
              disabled={busy || creatingFolder}
              onClick={() => void onCreateOnedriveFolder()}
              className="inline-flex w-full items-center justify-center rounded border border-sky-700 bg-sky-50 px-3 py-2 text-sm font-medium text-sky-800 hover:bg-sky-100 disabled:opacity-60"
            >
              {creatingFolder ? "Création…" : "Créer le dossier OneDrive"}
            </button>
          )}

          <fieldset className="rounded-lg border border-stone-300 bg-stone-50/60 p-3 text-sm">
            <legend className="px-1 font-medium text-stone-800">
              Installation / Pose
            </legend>
            <div className="mt-1 flex flex-wrap gap-4">
              <label className="inline-flex items-center gap-2">
                <input
                  type="radio"
                  name="edit-avec-pose"
                  checked={avecPose}
                  onChange={() => setAvecPose(true)}
                />
                Oui
              </label>
              <label className="inline-flex items-center gap-2">
                <input
                  type="radio"
                  name="edit-avec-pose"
                  checked={!avecPose}
                  onChange={() => setAvecPose(false)}
                />
                Non
              </label>
            </div>
            {avecPose ? (
              <label className="mt-3 block">
                <span className="mb-1 block font-medium">
                  Salarié responsable de la pose
                </span>
                <select
                  value={employePose}
                  onChange={(event) => setEmployePose(event.target.value)}
                  className="w-full rounded border border-stone-300 bg-white px-3 py-2"
                >
                  <option value="">Auto (premier disponible)</option>
                  {activeEmployees
                    .filter((employee) => employeeCanTakePhase(employee, "pose"))
                    .map((employee) => (
                      <option key={employee.id} value={employee.id}>
                        {employee.nom}
                      </option>
                    ))}
                </select>
              </label>
            ) : null}
          </fieldset>
          <fieldset className="rounded-lg border border-stone-300 bg-stone-50/60 p-3 text-sm">
            <legend className="px-1 font-medium text-stone-800">Fabrication</legend>
            <label className="mt-1 block">
              <span className="mb-1 block font-medium">
                Salarié responsable de la fabrication
              </span>
              <select
                value={employeFabrication}
                onChange={(event) => setEmployeFabrication(event.target.value)}
                className="w-full rounded border border-stone-300 bg-white px-3 py-2"
              >
                <option value="">Auto (premier disponible)</option>
                {activeEmployees
                  .filter((employee) =>
                    employeeCanTakePhase(employee, "fabrication"),
                  )
                  .map((employee) => (
                    <option key={employee.id} value={employee.id}>
                      {employee.nom}
                    </option>
                  ))}
              </select>
            </label>
          </fieldset>
          <fieldset className="rounded-lg border border-stone-300 bg-stone-50/60 p-3 text-sm">
            <legend className="px-1 font-medium text-stone-800">
              Thermolaquage / Galvanisation
            </legend>
            <div className="mt-1 flex flex-wrap gap-4">
              <label className="inline-flex items-center gap-2">
                <input
                  type="radio"
                  name="edit-avec-thermolaquage"
                  checked={avecThermolaquage}
                  onChange={() => setAvecThermolaquage(true)}
                />
                Oui
              </label>
              <label className="inline-flex items-center gap-2">
                <input
                  type="radio"
                  name="edit-avec-thermolaquage"
                  checked={!avecThermolaquage}
                  onChange={() => setAvecThermolaquage(false)}
                />
                Non
              </label>
            </div>
            {avecThermolaquage ? (
              <div className="mt-3 space-y-3">
                <label className="block">
                  <span className="mb-1 block font-medium">
                    Délai de laquage (jours ouvrés)
                  </span>
                  <input
                    type="number"
                    min={1}
                    max={60}
                    value={delaiLaquage}
                    onChange={(event) => setDelaiLaquage(event.target.value)}
                    className="w-full rounded border border-stone-300 bg-white px-3 py-2"
                  />
                </label>
                <SousTraitantSelect
                  value={sousTraitantId}
                  onChange={setSousTraitantId}
                  rows={snapshot.sousTraitants ?? []}
                />
                <p className="text-xs text-stone-500">
                  La phase se cale après la fabrication. Si une pose est prévue,
                  elle commence après ce thermolaquage.
                </p>
              </div>
            ) : null}
          </fieldset>
          <fieldset className="rounded-lg border border-stone-300 bg-stone-50/60 p-3 text-sm">
            <legend className="px-1 font-medium text-stone-800">Livraison</legend>
            <div className="mt-1 flex flex-wrap gap-4">
              <label className="inline-flex items-center gap-2">
                <input
                  type="radio"
                  name="edit-avec-livraison"
                  checked={avecLivraison}
                  onChange={() => setAvecLivraison(true)}
                />
                Oui
              </label>
              <label className="inline-flex items-center gap-2">
                <input
                  type="radio"
                  name="edit-avec-livraison"
                  checked={!avecLivraison}
                  onChange={() => setAvecLivraison(false)}
                />
                Non
              </label>
            </div>
            {avecLivraison ? (
              <div className="mt-3 space-y-3">
                <label className="block">
                  <span className="mb-1 block font-medium">Adresse de livraison</span>
                  <input
                    value={adresseLivraison}
                    onChange={(event) => setAdresseLivraison(event.target.value)}
                    className="w-full rounded border border-stone-300 bg-white px-3 py-2"
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block font-medium">
                    Téléphone de la personne qui réceptionne
                  </span>
                  <input
                    type="tel"
                    value={telephoneLivraison}
                    onChange={(event) => setTelephoneLivraison(event.target.value)}
                    className="w-full rounded border border-stone-300 bg-white px-3 py-2"
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block font-medium">Durée (heures)</span>
                  <input
                    type="number"
                    min={0.5}
                    step={0.5}
                    value={dureeLivraison}
                    onChange={(event) => setDureeLivraison(event.target.value)}
                    className="w-full rounded border border-stone-300 bg-white px-3 py-2"
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block font-medium">
                    Salarié responsable
                  </span>
                  <select
                    value={employeLivraison}
                    onChange={(event) => setEmployeLivraison(event.target.value)}
                    className="w-full rounded border border-stone-300 bg-white px-3 py-2"
                  >
                    <option value="">Choisir…</option>
                    {activeEmployees.map((employee) => (
                      <option key={employee.id} value={employee.id}>
                        {employee.nom}
                      </option>
                    ))}
                  </select>
                </label>
                <p className="text-xs text-stone-500">
                  La livraison se cale après le thermolaquage s’il y en a un, sinon
                  après la fabrication, et avant la pose.
                </p>
              </div>
            ) : null}
          </fieldset>

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
            Générer / Envoyer le bon de commande
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
