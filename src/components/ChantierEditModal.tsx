"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { BonCommandeModal } from "@/components/BonCommandeModal";
import { SousTraitantSelect } from "@/components/SousTraitantSelect";
import { FournituresEditor } from "@/components/FournituresEditor";
import { canGenerateBonCommande } from "@/lib/bon-commande/active-phase";
import { chantierVisibleOnGrid } from "@/lib/calendar";
import {
  chantierHasEstimativeDates,
  estimativePhaseIdsForChantier,
  fabricationPhaseIdsAwaitingLaunch,
} from "@/lib/dates-estimatives";
import { LaunchValidateButton } from "@/components/LaunchValidateButton";
import {
  STATUT_CHANTIER_LABELS,
  chantierDateRange,
  chantierPlanningInfo,
} from "@/lib/chantier-status";
import { chantierEndFromDureeJours, dureeJoursFromChantierRange, toISODate } from "@/lib/dates";
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
  planChantierDurationEdits,
} from "@/lib/engine/phase-chain";
import { EmployeePhaseSelect } from "@/components/EmployeePhaseSelect";
import { DureeJoursSelect } from "@/components/DureeJoursSelect";
import {
  daysFromPhaseHours,
  hoursFromDayPreset,
} from "@/lib/engine/duree-presets";
import { compareEmployeesByOrdre } from "@/lib/display-order";
import { moisToToleranceJours, toleranceJoursToMois } from "@/lib/priorite";
import { usePlanning } from "@/lib/planning-context";
import {
  STALE_CHANTIER_MESSAGE,
  chantierCascadeFingerprint,
  confirmStaleReload,
  useDebouncedPatch,
} from "@/lib/form-live";
import {
  clearFormDraft,
  readFormDraft,
  setUnsavedWork,
  useFlushFormDraft,
  writeFormDraft,
  type ChantierCascadeDraft,
} from "@/lib/form-draft";
import { formatSaveError } from "@/lib/supabase/errors";
import {
  type LigneFourniture,
} from "@/lib/fournitures";
import {
  FINITION_LAQUAGE_LABELS,
  FINITIONS_LAQUAGE,
  parseFinitionLaquage,
  type FinitionLaquage,
} from "@/lib/thermolaquage";
import {
  LOGISTIQUE_ROW_ID,
  TRANSPORT_ROW_ID,
  PRIORITES,
  PRIORITE_LABELS,
  PHASE_LABELS,
  type Chantier,
  type PhaseEdits,
  type PlanningSnapshot,
  type Priorite,
  type TypePhase,
} from "@/lib/types";
import { formatChantierOrigine } from "@/lib/chantier-origine";

const DELETE_CONFIRM =
  "Êtes-vous sûr ? Cette action est irréversible et supprimera aussi toutes les phases planifiées liées.";

const DURATION_TYPES: TypePhase[] = [
  "administratif",
  "fabrication",
  "livraison",
  "pose",
];

function hoursByPhaseIdFromSnapshot(
  snapshot: PlanningSnapshot,
  chantierId: string,
): Record<string, string> {
  const elementIds = new Set(
    snapshot.elements
      .filter((element) => element.chantier_id === chantierId)
      .map((element) => element.id),
  );
  const hours: Record<string, string> = {};
  for (const phase of snapshot.phases) {
    if (!elementIds.has(phase.element_id)) continue;
    hours[phase.id] = String(phase.duree_estimee_heures ?? "");
  }
  return hours;
}

function durationRowsForChantier(
  snapshot: PlanningSnapshot,
  chantierId: string,
  flags: {
    avecFabrication: boolean;
    avecPose: boolean;
    avecLivraison: boolean;
  },
): Array<{
  phaseId: string;
  label: string;
  type: TypePhase;
  employeId: string | null;
}> {
  const elements = snapshot.elements.filter(
    (element) => element.chantier_id === chantierId,
  );
  const rows: Array<{
    phaseId: string;
    label: string;
    type: TypePhase;
    employeId: string | null;
  }> = [];
  for (const element of elements) {
    const phases = snapshot.phases.filter(
      (phase) => phase.element_id === element.id,
    );
    for (const type of DURATION_TYPES) {
      if (type === "fabrication" && !flags.avecFabrication) continue;
      if (type === "pose" && !flags.avecPose) continue;
      if (type === "livraison" && !flags.avecLivraison) continue;
      const matches = phases.filter((phase) => phase.type_phase === type);
      for (const phase of matches) {
        const employee = snapshot.employees.find(
          (item) => item.id === phase.employe_id,
        );
        const who =
          matches.length > 1 && employee?.nom ? ` — ${employee.nom}` : "";
        const which =
          elements.length > 1 ? ` (${element.nom_element})` : "";
        rows.push({
          phaseId: phase.id,
          label: `${PHASE_LABELS[type]}${who}${which}`,
          type,
          employeId: phase.employe_id,
        });
      }
    }
  }
  return rows;
}

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
  const pathname = usePathname();
  const {
    snapshot,
    updateChantier,
    patchChantier,
    deleteChantier,
    scheduleChantierDay,
    applyPhaseEdits,
    confirmPhaseDates,
    validateChantierPlan,
    ensureChantierOnedriveFolder,
    refresh,
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
  const [datesDirty, setDatesDirty] = useState(false);
  const [planEmployeeId, setPlanEmployeeId] = useState("");
  const [datesEstimatives, setDatesEstimatives] = useState(
    Boolean(chantier.dates_estimatives),
  );
  const [error, setError] = useState<string | null>(null);
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [fournitures, setFournitures] = useState<LigneFourniture[]>(
    chantier.fournitures?.length ? chantier.fournitures : [],
  );
  const [couleurRal, setCouleurRal] = useState(chantier.couleur_ral ?? "");
  const [finition, setFinition] = useState<FinitionLaquage | "">(
    parseFinitionLaquage(chantier.finition) ?? "",
  );
  const [validatingPlan, setValidatingPlan] = useState(false);
  const currentOptions = useMemo(
    () => chantierPhaseOptions(snapshot, chantier.id),
    [snapshot, chantier.id],
  );
  const [avecPose, setAvecPose] = useState(currentOptions.avecPose);
  const [avecFabrication, setAvecFabrication] = useState(
    currentOptions.avecFabrication,
  );
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
  const [phaseHours, setPhaseHours] = useState<Record<string, string>>(() =>
    hoursByPhaseIdFromSnapshot(snapshot, chantier.id),
  );
  const [employeLivraison, setEmployeLivraison] = useState("");
  const [employeFabrication, setEmployeFabrication] = useState("");
  const [employePose, setEmployePose] = useState("");
  const [staleCascade, setStaleCascade] = useState(false);
  const dirtySimple = useRef(new Set<string>());
  const cascadeDirty = useRef(false);
  const cascadeBaseline = useRef("");
  const latestSnap = useRef(snapshot);
  latestSnap.current = snapshot;
  const unsavedKey = `chantier:${chantier.id}`;

  const applySimplePatch = useCallback(
    async (payload: {
      nom_client?: string;
      adresse?: string;
      priorite?: Priorite;
      tolerance_deplacement_jours?: number | null;
      lien_dossier_onedrive?: string | null;
      adresse_livraison?: string | null;
      telephone_livraison?: string | null;
      fournitures?: LigneFourniture[];
      couleur_ral?: string | null;
      finition?: FinitionLaquage | null;
    }) => {
      try {
        await patchChantier({ id: chantier.id, ...payload });
        Object.keys(payload).forEach((key) => dirtySimple.current.delete(key));
      } catch (err) {
        setError(formatSaveError(err, "l’enregistrement automatique a échoué"));
      }
    },
    [chantier.id, patchChantier],
  );
  const live = useDebouncedPatch(applySimplePatch);

  function markSimple(key: string) {
    dirtySimple.current.add(key);
  }

  function markCascade() {
    cascadeDirty.current = true;
    setUnsavedWork(unsavedKey, true);
  }

  function applyCascadeFromSnapshot(source: PlanningSnapshot = snapshot) {
    const options = chantierPhaseOptions(source, chantier.id);
    const latest =
      source.chantiers.find((item) => item.id === chantier.id) ?? chantier;
    setDatesEstimatives(chantierHasEstimativeDates(source, chantier.id));
    setAvecPose(options.avecPose);
    setAvecFabrication(options.avecFabrication);
    setAvecThermolaquage(options.avecThermolaquage);
    setAvecLivraison(options.avecLivraison);
    setDelaiLaquage(String(latest.delai_sous_traitance_jours || 5));
    setSousTraitantId(latest.sous_traitant_id ?? "");
    const liv = source.phases.find((phase) => {
      const element = source.elements.find((item) => item.id === phase.element_id);
      return (
        element?.chantier_id === chantier.id &&
        phase.type_phase === "livraison" &&
        (Boolean(phase.date_debut) || Number(phase.duree_estimee_heures) > 0)
      );
    });
    setDureeLivraison(String(liv?.duree_estimee_heures || 2));
    setPhaseHours(hoursByPhaseIdFromSnapshot(source, chantier.id));
    setEmployeLivraison(liv?.employe_id ?? "");
    const fab = source.phases.find((phase) => {
      const element = source.elements.find((item) => item.id === phase.element_id);
      return element?.chantier_id === chantier.id && phase.type_phase === "fabrication";
    });
    const pose = source.phases.find((phase) => {
      const element = source.elements.find((item) => item.id === phase.element_id);
      return (
        element?.chantier_id === chantier.id &&
        phase.type_phase === "pose" &&
        (Boolean(phase.date_debut) || Number(phase.duree_estimee_heures) > 0)
      );
    });
    setEmployeFabrication(fab?.employe_id ?? "");
    setEmployePose(pose?.employe_id ?? "");
    setDatesDirty(false);
    cascadeDirty.current = false;
    cascadeBaseline.current = chantierCascadeFingerprint(source, chantier.id);
    setStaleCascade(false);
    setUnsavedWork(unsavedKey, false);
  }

  function applyChantierDraft(draft: ChantierCascadeDraft) {
    setDatesEstimatives(draft.datesEstimatives);
    setAvecPose(draft.avecPose);
    setAvecFabrication(draft.avecFabrication ?? true);
    setAvecThermolaquage(draft.avecThermolaquage);
    setAvecLivraison(draft.avecLivraison);
    setDelaiLaquage(draft.delaiLaquage);
    setSousTraitantId(draft.sousTraitantId);
    setDureeLivraison(draft.dureeLivraison);
    setEmployeLivraison(draft.employeLivraison);
    setEmployeFabrication(draft.employeFabrication);
    setEmployePose(draft.employePose);
    setPlanEmployeeId(draft.planEmployeeId);
    cascadeDirty.current = true;
    setUnsavedWork(unsavedKey, true);
  }

  useEffect(() => {
    dirtySimple.current.clear();
    cascadeDirty.current = false;
    cascadeBaseline.current = chantierCascadeFingerprint(snapshot, chantier.id);
    setNomClient(chantier.nom_client);
    setAdresse(chantier.adresse);
    setLien(chantier.lien_dossier_onedrive ?? "");
    setPriorite(chantier.priorite);
    setToleranceMois(toleranceJoursToMois(chantier.tolerance_deplacement_jours));
    setAdresseLivraison(chantier.adresse_livraison ?? "");
    setTelephoneLivraison(chantier.telephone_livraison ?? "");
    setFournitures(chantier.fournitures?.length ? chantier.fournitures : []);
    setCouleurRal(chantier.couleur_ral ?? "");
    setFinition(parseFinitionLaquage(chantier.finition) ?? "");
    applyCascadeFromSnapshot();
    const draft = readFormDraft();
    if (draft?.kind === "chantier" && draft.id === chantier.id) {
      applyChantierDraft(draft);
    }
    setError(null);
    live.cancel();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reset only when switching chantier
  }, [chantier.id]);

  useEffect(() => {
    const latest =
      snapshot.chantiers.find((item) => item.id === chantier.id) ?? chantier;
    if (!dirtySimple.current.has("nom_client")) setNomClient(latest.nom_client);
    if (!dirtySimple.current.has("adresse")) setAdresse(latest.adresse);
    if (!dirtySimple.current.has("lien_dossier_onedrive")) {
      setLien(latest.lien_dossier_onedrive ?? "");
    }
    if (!dirtySimple.current.has("priorite")) setPriorite(latest.priorite);
    if (!dirtySimple.current.has("tolerance_deplacement_jours")) {
      setToleranceMois(toleranceJoursToMois(latest.tolerance_deplacement_jours));
    }
    if (!dirtySimple.current.has("adresse_livraison")) {
      setAdresseLivraison(latest.adresse_livraison ?? "");
    }
    if (!dirtySimple.current.has("telephone_livraison")) {
      setTelephoneLivraison(latest.telephone_livraison ?? "");
    }
    if (!dirtySimple.current.has("fournitures")) {
      setFournitures(latest.fournitures?.length ? latest.fournitures : []);
    }
    if (!dirtySimple.current.has("couleur_ral")) {
      setCouleurRal(latest.couleur_ral ?? "");
    }
    if (!dirtySimple.current.has("finition")) {
      setFinition(parseFinitionLaquage(latest.finition) ?? "");
    }
    const remoteFp = chantierCascadeFingerprint(snapshot, chantier.id);
    if (!cascadeDirty.current) {
      applyCascadeFromSnapshot();
    } else {
      setStaleCascade(remoteFp !== cascadeBaseline.current && remoteFp !== "");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snapshot, chantier]);

  const info = useMemo(
    () => chantierPlanningInfo(snapshot, chantier.id),
    [snapshot, chantier.id],
  );
  const latestChantier =
    snapshot.chantiers.find((item) => item.id === chantier.id) ?? chantier;
  const planValide = Boolean(latestChantier.plan_valide);
  const isPlanned = Boolean(info.firstDate && info.lastDate);
  const visibleOnGrid = useMemo(
    () => chantierVisibleOnGrid(snapshot, chantier.id),
    [snapshot, chantier.id],
  );
  const durationRows = useMemo(
    () =>
      durationRowsForChantier(snapshot, chantier.id, {
        avecFabrication,
        avecPose,
        avecLivraison,
      }),
    [snapshot, chantier.id, avecFabrication, avecPose, avecLivraison],
  );

  function parsedHoursByPhaseId(): Record<string, number> {
    const hours: Record<string, number> = {};
    for (const row of durationRows) {
      const raw =
        row.type === "livraison" ? dureeLivraison : phaseHours[row.phaseId];
      const value = Number(raw);
      if (Number.isFinite(value) && value >= 0) hours[row.phaseId] = value;
    }
    return hours;
  }

  function combinedPhaseEdits(source: PlanningSnapshot): PhaseEdits {
    const dateEdits =
      visibleOnGrid && datesDirty
        ? planChantierDateEdits(
            source,
            chantier.id,
            planDate,
            planEnd || planDate,
          )
        : {};
    const preview = previewPhaseEdits(source, dateEdits);
    const optionEdits = planChantierOptionEdits(preview, chantier.id, {
      avecFabrication,
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
    const afterOptions = previewPhaseEdits(preview, optionEdits);
    const durationEdits = planChantierDurationEdits(
      afterOptions,
      chantier.id,
      parsedHoursByPhaseId(),
      Number(delaiLaquage || 5),
    );
    return mergePhaseEdits(mergePhaseEdits(dateEdits, optionEdits), durationEdits);
  }

  function setHoursForPhase(phaseId: string, type: TypePhase, value: string) {
    markCascade();
    setPhaseHours((current) => ({ ...current, [phaseId]: value }));
    if (type === "livraison") setDureeLivraison(value);
  }

  function setDaysForPhase(phaseId: string, type: TypePhase, jours: number) {
    const row = durationRows.find((item) => item.phaseId === phaseId);
    setHoursForPhase(
      phaseId,
      type,
      String(hoursFromDayPreset(snapshot, row?.employeId, jours)),
    );
  }

  const activeEmployees = useMemo(
    () =>
      snapshot.employees
        .filter((employee) => employee.actif && employee.id !== LOGISTIQUE_ROW_ID && employee.id !== TRANSPORT_ROW_ID)
        .sort(compareEmployeesByOrdre),
    [snapshot.employees],
  );

  useEffect(() => {
    const draft = readFormDraft();
    if (draft?.kind === "chantier" && draft.id === chantier.id) {
      setDatesDirty(true);
      setPlanDate(draft.planDate);
      setPlanEnd(draft.planEnd);
      return;
    }
    setDatesDirty(false);
    setPlanDate(info.firstDate ?? toISODate(new Date()));
    setPlanEnd(info.lastDate ?? info.firstDate ?? toISODate(new Date()));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reset only when switching chantier
  }, [chantier.id]);

  useEffect(() => {
    if (!planEmployeeId && activeEmployees[0]) {
      setPlanEmployeeId(activeEmployees[0].id);
    }
  }, [activeEmployees, planEmployeeId]);

  const previewRange = useMemo(() => {
    try {
      const edits = combinedPhaseEdits(snapshot);
      return chantierDateRange(previewPhaseEdits(snapshot, edits), chantier.id);
    } catch {
      return { firstDate: planDate || null, lastDate: planEnd || null };
    }
    // combinedPhaseEdits reads the cascade fields listed below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    snapshot,
    chantier.id,
    visibleOnGrid,
    datesDirty,
    planDate,
    planEnd,
    avecPose,
    avecFabrication,
    avecThermolaquage,
    avecLivraison,
    dureeLivraison,
    employeLivraison,
    employeFabrication,
    employePose,
    delaiLaquage,
    datesEstimatives,
    phaseHours,
    durationRows,
  ]);

  useEffect(() => {
    if (datesDirty) return;
    if (previewRange.firstDate) setPlanDate(previewRange.firstDate);
    if (previewRange.lastDate) setPlanEnd(previewRange.lastDate);
  }, [datesDirty, previewRange.firstDate, previewRange.lastDate]);

  const persistDraft = useCallback(() => {
    writeFormDraft({
      kind: "chantier",
      id: chantier.id,
      path: pathname,
      planDate,
      planEnd,
      datesDirty,
      planEmployeeId,
      datesEstimatives,
      avecPose,
      avecFabrication,
      avecThermolaquage,
      avecLivraison,
      delaiLaquage,
      sousTraitantId,
      dureeLivraison,
      employeLivraison,
      employeFabrication,
      employePose,
    });
  }, [
    pathname,
    chantier.id,
    planDate,
    planEnd,
    datesDirty,
    planEmployeeId,
    datesEstimatives,
    avecPose,
    avecFabrication,
    avecThermolaquage,
    avecLivraison,
    delaiLaquage,
    sousTraitantId,
    dureeLivraison,
    employeLivraison,
    employeFabrication,
    employePose,
  ]);

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

  function dismissForm() {
    cascadeDirty.current = false;
    setUnsavedWork(unsavedKey, false);
    clearFormDraft("chantier", chantier.id);
    onClose();
  }

  const onedriveUrl = onedriveHref(lien || chantier.lien_dossier_onedrive || "");
  const busy = saving || scheduling || deleting || validatingPlan;

  function onChangeStart(next: string) {
    setDatesDirty(true);
    markCascade();
    const jours =
      planDate && planEnd
        ? dureeJoursFromChantierRange(planDate, planEnd)
        : 1;
    setPlanDate(next);
    if (next) setPlanEnd(chantierEndFromDureeJours(next, jours));
  }

  async function abortIfStaleCascade(force = false): Promise<boolean> {
    const latest = (await refresh({ quiet: true })) ?? latestSnap.current;
    latestSnap.current = latest;
    const remote = chantierCascadeFingerprint(latest, chantier.id);
    const range = chantierDateRange(latest, chantier.id);
    if (!force && !cascadeDirty.current) {
      applyCascadeFromSnapshot(latest);
      if (!datesDirty) {
        setPlanDate(range.firstDate ?? toISODate(new Date()));
        setPlanEnd(range.lastDate ?? range.firstDate ?? toISODate(new Date()));
      }
      return false;
    }
    if (!remote || remote === cascadeBaseline.current) return false;
    const reload = confirmStaleReload(STALE_CHANTIER_MESSAGE);
    if (reload) {
      applyCascadeFromSnapshot(latest);
      setPlanDate(range.firstDate ?? toISODate(new Date()));
      setPlanEnd(range.lastDate ?? range.firstDate ?? toISODate(new Date()));
    }
    return true;
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
    const snap = latestSnap.current;
    const edits = combinedPhaseEdits(snap);
    const after = previewPhaseEdits(snap, edits);
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
    }
    setSaving(true);
    setError(null);
    try {
      const hadCascadeEdits = cascadeDirty.current;
      await live.flush();
      if (await abortIfStaleCascade()) {
        setSaving(false);
        return;
      }
      if (hadCascadeEdits) {
      const removed: string[] = [];
      if (currentOptions.avecFabrication && !avecFabrication) {
        removed.push("Fabrication");
      }
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
        datesDirty &&
        (planDate !== startBefore || (planEnd || planDate) !== endBefore);
      await persistPlanning(false);
      const confirmIds = Array.from(
        new Set([
          ...estimativePhaseIdsForChantier(latestSnap.current, chantier.id),
          ...(!datesEstimatives
            ? fabricationPhaseIdsAwaitingLaunch(latestSnap.current, chantier.id)
            : []),
        ]),
      );
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
      }
      dismissForm();
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
      if (await abortIfStaleCascade(true)) {
        setScheduling(false);
        return;
      }
      markCascade();
      await persistPlanning(true);
      cascadeDirty.current = false;
      setStaleCascade(false);
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
      dismissForm();
      router.push("/chantiers");
    } catch (err) {
      setError(formatSaveError(err, "la suppression a échoué"));
      setDeleting(false);
    }
  }

  async function onValidatePlan() {
    setValidatingPlan(true);
    setError(null);
    try {
      await live.flush();
      await patchChantier({ id: chantier.id, fournitures });
      await validateChantierPlan(chantier.id);
    } catch (err) {
      setError(formatSaveError(err, "la validation du plan a échoué"));
    } finally {
      setValidatingPlan(false);
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
          {planValide ? " · Plan validé" : " · Plan à faire"}
        </p>
        <p className="mt-1 text-sm font-medium text-stone-700">
          {formatChantierOrigine(chantier)}
        </p>
        <p className="mt-2 text-xs text-stone-500">
          Nom, adresse, priorité et lien OneDrive s’enregistrent tout seuls. Les
          dates, durées, salariés et Oui/Non des phases s’appliquent avec Enregistrer.
        </p>
        {staleCascade ? (
          <p className="mt-2 rounded border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-950">
            Ce chantier a été modifié entre-temps par quelqu’un d’autre.{" "}
            <button
              type="button"
              className="font-medium underline"
              onClick={() => {
                applyCascadeFromSnapshot();
                setPlanDate(info.firstDate ?? toISODate(new Date()));
                setPlanEnd(info.lastDate ?? info.firstDate ?? toISODate(new Date()));
              }}
            >
              Recharger la fiche
            </button>
          </p>
        ) : null}
        <div className="mt-4 space-y-3">
          <label className="block text-sm">
            <span className="mb-1 block">Nom</span>
            <input
              value={nomClient}
              onChange={(event) => {
                const value = event.target.value;
                setNomClient(value);
                markSimple("nom_client");
                if (value.trim()) live.schedule({ nom_client: value.trim() });
              }}
              onBlur={() => {
                if (nomClient.trim()) void live.flush();
              }}
              className="w-full rounded border border-stone-300 px-3 py-2"
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block">Adresse</span>
            <input
              value={adresse}
              onChange={(event) => {
                const value = event.target.value;
                setAdresse(value);
                markSimple("adresse");
                live.schedule({ adresse: value.trim() });
              }}
              onBlur={() => void live.flush()}
              className="w-full rounded border border-stone-300 px-3 py-2"
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block">Priorité</span>
            <select
              value={priorite}
              onChange={(event) => {
                const value = event.target.value as Priorite;
                setPriorite(value);
                markSimple("priorite");
                void applySimplePatch({
                  priorite: value,
                  tolerance_deplacement_jours:
                    value === "pas_presse"
                      ? moisToToleranceJours(toleranceMois)
                      : null,
                });
              }}
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
                onChange={(event) => {
                  const mois = Number(event.target.value);
                  setToleranceMois(mois);
                  markSimple("tolerance_deplacement_jours");
                  void applySimplePatch({
                    priorite: "pas_presse",
                    tolerance_deplacement_jours: moisToToleranceJours(mois),
                  });
                }}
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
              onChange={(event) => {
                const value = event.target.value;
                setLien(value);
                markSimple("lien_dossier_onedrive");
                live.schedule({
                  lien_dossier_onedrive: value.trim() || null,
                });
              }}
              onBlur={() => void live.flush()}
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

          <fieldset className="rounded-lg border border-violet-200 bg-violet-50/50 p-3">
            <legend className="px-1 text-sm font-medium text-stone-800">
              Plan
              <span
                className={`ml-2 rounded border px-1.5 py-px text-[10px] font-semibold uppercase tracking-wide ${
                  planValide
                    ? "border-emerald-400 bg-emerald-50 text-emerald-800"
                    : "border-dashed border-violet-400 bg-white text-violet-800"
                }`}
              >
                {planValide ? "Plan validé" : "Plan à faire"}
              </span>
            </legend>
            <p className="mt-1 text-xs text-stone-600">
              Liste des fournitures à remplir avec le plan. La validation crée une
              commande pour Alexis (bandeau, badge, e-mail et lien OneDrive).
            </p>
            <div className="mt-3">
              <FournituresEditor
                rows={fournitures}
                onChange={(next) => {
                  setFournitures(next);
                  markSimple("fournitures");
                  live.schedule({
                    fournitures: next,
                  });
                }}
              />
            </div>
            {planValide ? null : (
              <button
                type="button"
                disabled={busy || validatingPlan}
                onClick={() => void onValidatePlan()}
                className="mt-3 rounded bg-violet-800 px-3 py-2 text-sm text-violet-50 disabled:opacity-60"
              >
                {validatingPlan ? "Validation…" : "Plan validé"}
              </button>
            )}
          </fieldset>

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
                  onChange={() => {
                    markCascade();
                    setAvecPose(true);
                  }}
                />
                Oui
              </label>
              <label className="inline-flex items-center gap-2">
                <input
                  type="radio"
                  name="edit-avec-pose"
                  checked={!avecPose}
                  onChange={() => {
                    markCascade();
                    setAvecPose(false);
                  }}
                />
                Non
              </label>
            </div>
            {avecPose ? (
              <label className="mt-3 block">
                <span className="mb-1 block font-medium">
                  Salarié responsable de la pose
                </span>
                <EmployeePhaseSelect
                  employees={activeEmployees}
                  type="pose"
                  value={employePose}
                  onChange={(id) => {
                    markCascade();
                    setEmployePose(id);
                  }}
                  emptyLabel="Auto (premier disponible)"
                  className="w-full rounded border border-stone-300 bg-white px-3 py-2"
                />
              </label>
            ) : null}
          </fieldset>
          <fieldset className="rounded-lg border border-stone-300 bg-stone-50/60 p-3 text-sm">
            <legend className="px-1 font-medium text-stone-800">Fabrication</legend>
            <div className="mt-1 flex flex-wrap gap-4">
              <label className="inline-flex items-center gap-2">
                <input
                  type="radio"
                  name="edit-avec-fabrication"
                  checked={avecFabrication}
                  onChange={() => {
                    markCascade();
                    setAvecFabrication(true);
                  }}
                />
                Oui
              </label>
              <label className="inline-flex items-center gap-2">
                <input
                  type="radio"
                  name="edit-avec-fabrication"
                  checked={!avecFabrication}
                  onChange={() => {
                    markCascade();
                    setAvecFabrication(false);
                  }}
                />
                Non
              </label>
            </div>
            {avecFabrication ? (
              <label className="mt-3 block">
                <span className="mb-1 block font-medium">
                  Salarié responsable de la fabrication
                </span>
                <EmployeePhaseSelect
                  employees={activeEmployees}
                  type="fabrication"
                  value={employeFabrication}
                  onChange={(id) => {
                    markCascade();
                    setEmployeFabrication(id);
                  }}
                  emptyLabel="Auto (premier disponible)"
                  className="w-full rounded border border-stone-300 bg-white px-3 py-2"
                />
              </label>
            ) : null}
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
                  onChange={() => {
                    markCascade();
                    setAvecThermolaquage(true);
                  }}
                />
                Oui
              </label>
              <label className="inline-flex items-center gap-2">
                <input
                  type="radio"
                  name="edit-avec-thermolaquage"
                  checked={!avecThermolaquage}
                  onChange={() => {
                    markCascade();
                    setAvecThermolaquage(false);
                  }}
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
                    onChange={(event) => {
                      markCascade();
                      setDelaiLaquage(event.target.value);
                    }}
                    className="w-full rounded border border-stone-300 bg-white px-3 py-2"
                  />
                </label>
                <SousTraitantSelect
                  value={sousTraitantId}
                  onChange={(id) => {
                    markCascade();
                    setSousTraitantId(id);
                  }}
                  rows={snapshot.sousTraitants ?? []}
                />
                <label className="block">
                  <span className="mb-1 block font-medium">Couleur RAL</span>
                  <input
                    value={couleurRal}
                    placeholder="ex. RAL 7016"
                    onChange={(event) => {
                      const value = event.target.value;
                      setCouleurRal(value);
                      markSimple("couleur_ral");
                      live.schedule({
                        couleur_ral: value.trim() || null,
                      });
                    }}
                    onBlur={() => void live.flush()}
                    className="w-full rounded border border-stone-300 bg-white px-3 py-2"
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block font-medium">Finition</span>
                  <select
                    value={finition}
                    onChange={(event) => {
                      const value =
                        parseFinitionLaquage(event.target.value) ?? null;
                      setFinition(value ?? "");
                      markSimple("finition");
                      void applySimplePatch({ finition: value });
                    }}
                    className="w-full rounded border border-stone-300 bg-white px-3 py-2"
                  >
                    <option value="">Non renseignée</option>
                    {FINITIONS_LAQUAGE.map((value) => (
                      <option key={value} value={value}>
                        {FINITION_LAQUAGE_LABELS[value]}
                      </option>
                    ))}
                  </select>
                </label>
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
                  onChange={() => {
                    markCascade();
                    setAvecLivraison(true);
                  }}
                />
                Oui
              </label>
              <label className="inline-flex items-center gap-2">
                <input
                  type="radio"
                  name="edit-avec-livraison"
                  checked={!avecLivraison}
                  onChange={() => {
                    markCascade();
                    setAvecLivraison(false);
                  }}
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
                    onChange={(event) => {
                      const value = event.target.value;
                      setAdresseLivraison(value);
                      markSimple("adresse_livraison");
                      live.schedule({ adresse_livraison: value.trim() || null });
                    }}
                    onBlur={() => void live.flush()}
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
                    onChange={(event) => {
                      const value = event.target.value;
                      setTelephoneLivraison(value);
                      markSimple("telephone_livraison");
                      live.schedule({
                        telephone_livraison: value.trim() || null,
                      });
                    }}
                    onBlur={() => void live.flush()}
                    className="w-full rounded border border-stone-300 bg-white px-3 py-2"
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block font-medium">
                    Salarié responsable
                  </span>
                  <select
                    value={employeLivraison}
                    onChange={(event) => {
                      markCascade();
                      setEmployeLivraison(event.target.value);
                    }}
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

          {durationRows.length > 0 ? (
            <fieldset className="rounded-lg border border-stone-300 bg-stone-50/60 p-3 text-sm">
              <legend className="px-1 font-medium text-stone-800">
                Durées estimées
              </legend>
              <p className="mt-1 text-xs text-stone-600">
                Durée de chaque phase en jours ouvrés (1 à 15). Changer une
                durée recale les phases suivantes.
              </p>
              <div className="mt-3 space-y-3">
                {durationRows.map((row) => {
                  const value =
                    row.type === "livraison"
                      ? dureeLivraison
                      : (phaseHours[row.phaseId] ?? "");
                  return (
                    <div key={row.phaseId}>
                      <span className="mb-1 block font-medium">{row.label}</span>
                      <DureeJoursSelect
                        value={daysFromPhaseHours(
                          snapshot,
                          row.employeId,
                          Number(value || 0),
                        )}
                        aria-label={`Durée en jours — ${row.label}`}
                        className="w-full rounded border border-stone-300 bg-white px-3 py-2"
                        onChange={(jours) =>
                          setDaysForPhase(row.phaseId, row.type, jours)
                        }
                      />
                    </div>
                  );
                })}
              </div>
            </fieldset>
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
            <div className="mt-3 flex flex-wrap gap-4 text-sm">
              <label className="inline-flex items-center gap-2">
                <input
                  type="radio"
                  name="edit-dates-kind"
                  checked={datesEstimatives}
                  onChange={() => {
                    markCascade();
                    setDatesEstimatives(true);
                  }}
                />
                Estimatif
              </label>
              <label className="inline-flex items-center gap-2">
                <input
                  type="radio"
                  name="edit-dates-kind"
                  checked={!datesEstimatives}
                  onChange={() => {
                    markCascade();
                    setDatesEstimatives(false);
                  }}
                />
                Confirmé
              </label>
            </div>
            <p className="mt-2 text-xs text-stone-500">
              Modifier le début ou la fin confirme les dates. Un chantier déjà
              commencé, un bon de commande, ou « Je valide le lancement » aussi.
            </p>
            <div className="mt-3">
              {fabricationPhaseIdsAwaitingLaunch(snapshot, chantier.id).map(
                (phaseId) => (
                  <LaunchValidateButton key={phaseId} phaseId={phaseId} />
                ),
              )}
            </div>
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
                    onChange={(event) => {
                      markCascade();
                      setPlanEmployeeId(event.target.value);
                    }}
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
            onClick={dismissForm}
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
