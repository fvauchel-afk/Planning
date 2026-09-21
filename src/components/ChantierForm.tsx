"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { ConflictModal } from "@/components/ConflictModal";
import { compareEmployeesByOrdre } from "@/lib/display-order";
import { employeeAvailableOnRange, rangeEndFromHours } from "@/lib/engine/hours";
import { PhaseDureeFields } from "@/components/DureeJoursSelect";
import {
  inspectManualSlotConflict,
  mergePlanIntoInput,
  planChantier,
  type PlanResult,
  type SlotConflict,
} from "@/lib/engine/planner";
import { PlacementConflictPanel } from "@/components/PlacementConflictPanel";
import {
  ensureChantierDatesOnCreate,
  inputHasExplicitDates,
} from "@/lib/engine/earliest-date";
import { generatePlanSolutions, propositionFromSolutions } from "@/lib/engine/plan-solutions";
import { applyPhaseChainOnCreate, firstWorkingOnOrBefore, missingRequiredAssignee } from "@/lib/engine/phase-chain";
import { withExtraPoseurs } from "@/lib/engine/create-phases";
import { moisToToleranceJours } from "@/lib/priorite";
import { EmployeePhaseSelect } from "@/components/EmployeePhaseSelect";
import {
  coerceSelectValue,
  employeesForPhaseSelect,
} from "@/lib/chantier-status";
import { usePlanning } from "@/lib/planning-context";
import { SousTraitantSelect } from "@/components/SousTraitantSelect";
import { formatSaveError } from "@/lib/supabase/errors";
import { useSession } from "@/lib/auth/session-context";
import {
  FINITION_LAQUAGE_LABELS,
  FINITIONS_LAQUAGE,
  parseFinitionLaquage,
  type FinitionLaquage,
} from "@/lib/thermolaquage";
import {
  hasPendingSignalements,
  PENDING_CHANTIER_MESSAGE,
  propositionFromDelay,
} from "@/lib/signalements";
import {
  PHASE_LABELS,
  PRIORITES,
  PRIORITE_LABELS,
  TYPES_PHASE,
  type Employee,
  type NewChantierInput,
  type PhasePatch,
  type PlanningSnapshot,
  type Priorite,
  type TypePhase,
} from "@/lib/types";

type PhaseForm = {
  type_phase: TypePhase;
  duree_estimee_heures: string;
  date_debut: string;
  date_fin: string;
  employe_id: string;
  urgent: boolean;
  heures_supplementaires_par_jour: number;
};

type ElementForm = {
  key: string;
  nom_element: string;
  phases: PhaseForm[];
};

function employeesForPhaseRow(
  snapshot: PlanningSnapshot,
  employees: Employee[],
  phase: PhaseForm,
) {
  const listed = employeesForPhaseSelect(employees, phase.type_phase, phase.employe_id);
  const available = listed.filter((employee) =>
    employeeAvailableOnRange(
      snapshot,
      employee,
      phase.date_debut || null,
      phase.date_fin || phase.date_debut || null,
    ),
  );
  if (phase.employe_id && !available.some((item) => item.id === phase.employe_id)) {
    const selected = listed.find((item) => item.id === phase.employe_id);
    if (selected) available.push(selected);
  }
  return available.length > 0 ? available : listed;
}

function coercePhasePersonValue(
  snapshot: PlanningSnapshot,
  employees: Employee[],
  phase: PhaseForm,
) {
  return coerceSelectValue(
    phase.employe_id,
    employeesForPhaseRow(snapshot, employees, phase),
  );
}

function emptyPhases(): PhaseForm[] {
  return TYPES_PHASE.map((type_phase) => ({
    type_phase,
    duree_estimee_heures: "",
    date_debut: "",
    date_fin: "",
    employe_id: "",
    urgent: false,
    heures_supplementaires_par_jour: 0,
  }));
}

export function ChantierForm() {
  const router = useRouter();
  const { snapshot, loading, createChantier, createSignalement } = usePlanning();
  const { session } = useSession();
  const [nomClient, setNomClient] = useState("");
  const [adresse, setAdresse] = useState("");
  const [lien, setLien] = useState("");
  const [priorite, setPriorite] = useState<Priorite>("normal");
  const [toleranceMois, setToleranceMois] = useState(1);
  const [urgent, setUrgent] = useState(false);
  const [dateDebut, setDateDebut] = useState("");
  const [dateFin, setDateFin] = useState("");
  const [datesEstimatives, setDatesEstimatives] = useState(true);
  const [avecPose, setAvecPose] = useState<boolean | null>(null);
  const [avecAdministratif, setAvecAdministratif] = useState<boolean | null>(null);
  const [avecFabrication, setAvecFabrication] = useState<boolean | null>(null);
  const [avecThermolaquage, setAvecThermolaquage] = useState<boolean | null>(null);
  const [avecLivraison, setAvecLivraison] = useState<boolean | null>(null);
  const [adresseLivraison, setAdresseLivraison] = useState("");
  const [telephoneLivraison, setTelephoneLivraison] = useState("");
  const [employeLivraison, setEmployeLivraison] = useState("");
  const [employeAdministratif, setEmployeAdministratif] = useState("");
  const [employeFabrication, setEmployeFabrication] = useState("");
  const [poseurIds, setPoseurIds] = useState<string[]>([]);
  const [delaiLaquage, setDelaiLaquage] = useState("5");
  const [dateLaquageDebut, setDateLaquageDebut] = useState("");
  const [dateLaquageFin, setDateLaquageFin] = useState("");
  const [sousTraitantId, setSousTraitantId] = useState("");
  const [couleurRal, setCouleurRal] = useState("");
  const [finition, setFinition] = useState<FinitionLaquage | "">("");
  const [elements, setElements] = useState<ElementForm[]>([
    { key: "el-1", nom_element: "", phases: emptyPhases() },
  ]);
  const [saving, setSaving] = useState(false);
  const [placing, setPlacing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [conflict, setConflict] = useState<PlanResult | null>(null);
  const [pendingInput, setPendingInput] = useState<NewChantierInput | null>(null);
  const [slotConflict, setSlotConflict] = useState<SlotConflict | null>(null);

  const employeesByRole = useMemo(() => {
    return snapshot.employees
      .filter((employee) => employee.actif)
      .sort(compareEmployeesByOrdre);
  }, [snapshot.employees]);

  const employePose = poseurIds[0] ?? "";
  const poseCandidates = useMemo(
    () => employeesForPhaseSelect(employeesByRole, "pose", employePose),
    [employeesByRole, employePose],
  );
  const poseDateDebut = dateDebut;
  const poseHours = Number(
    elements
      .flatMap((element) => element.phases)
      .find((phase) => phase.type_phase === "pose")?.duree_estimee_heures || 0,
  );
  const poseDateFin = dateDebut
    ? poseHours > 0
      ? rangeEndFromHours(snapshot, employePose || null, dateDebut, poseHours)
      : dateDebut
    : "";
  const suggestedPoseurs = useMemo(() => {
    if (!poseDateDebut) return [];
    return poseCandidates.filter((employee) =>
      employeeAvailableOnRange(
        snapshot,
        employee,
        poseDateDebut,
        poseDateFin || poseDateDebut,
      ),
    );
  }, [poseCandidates, poseDateDebut, poseDateFin, snapshot]);

  function togglePoseur(id: string) {
    setPoseurIds((current) =>
      current.includes(id)
        ? current.filter((item) => item !== id)
        : [...current, id],
    );
  }

  function updateElement(key: string, patch: Partial<ElementForm>) {
    setElements((current) =>
      current.map((element) =>
        element.key === key ? { ...element, ...patch } : element,
      ),
    );
  }

  function updatePhase(
    elementKey: string,
    type: TypePhase,
    patch: Partial<PhaseForm>,
  ) {
    setElements((current) =>
      current.map((element) =>
        element.key === elementKey
          ? {
              ...element,
              phases: element.phases.map((phase) =>
                phase.type_phase === type ? { ...phase, ...patch } : phase,
              ),
            }
          : element,
      ),
    );
  }

  function linkedPhaseType(): TypePhase | null {
    if (avecAdministratif === true) return "administratif";
    if (avecFabrication === true) return "fabrication";
    if (avecFabrication === false && avecPose === true) return "pose";
    return null;
  }

  function employeeIdForPhaseHours(phase: PhaseForm): string {
    if (phase.type_phase === "administratif") {
      return employeAdministratif || phase.employe_id;
    }
    if (phase.type_phase === "fabrication") {
      return employeFabrication || phase.employe_id;
    }
    if (phase.type_phase === "pose") return employePose || phase.employe_id;
    if (phase.type_phase === "livraison") {
      return employeLivraison || phase.employe_id;
    }
    return phase.employe_id;
  }

  function hoursForPhase(phase: PhaseForm): number {
    return Number(phase.duree_estimee_heures || 0);
  }

  function withInternalDates(
    current: ElementForm[],
    debut: string,
  ): ElementForm[] {
    const linked = linkedPhaseType();
    return current.map((element) => ({
      ...element,
      phases: element.phases.map((phase) => {
        if (!debut || phase.type_phase !== linked) {
          return debut
            ? phase
            : { ...phase, date_debut: "", date_fin: "" };
        }
        const hours = Number(phase.duree_estimee_heures || 0);
        const fin =
          hours > 0
            ? rangeEndFromHours(
                snapshot,
                employeeIdForPhaseHours(phase) || null,
                debut,
                hours,
              )
            : debut;
        return {
          ...phase,
          date_debut: debut,
          date_fin: fin,
        };
      }),
    }));
  }

  function setChantierDebut(nextDebut: string) {
    setDateDebut(nextDebut);
    setElements((current) => withInternalDates(current, nextDebut));
  }

  function setPhaseHoursValue(
    elementKey: string,
    type: TypePhase,
    hours: string,
  ) {
    setElements((current) =>
      withInternalDates(
        current.map((element) =>
          element.key === elementKey
            ? {
                ...element,
                phases: element.phases.map((phase) =>
                  phase.type_phase === type
                    ? { ...phase, duree_estimee_heures: hours }
                    : phase,
                ),
              }
            : element,
        ),
        dateDebut,
      ),
    );
  }

  function buildInput(): NewChantierInput | null {
    if (!nomClient.trim()) {
      setError("Le nom du client est obligatoire.");
      return null;
    }
    const namedElements = elements.filter((element) => element.nom_element.trim());
    if (namedElements.length === 0) {
      setError("Ajoutez au moins un élément (pergola, portail, table…).");
      return null;
    }
    if (avecPose === null) {
      setError("Indiquez si le chantier comprend une installation / pose.");
      return null;
    }
    if (avecAdministratif === null) {
      setError("Indiquez si le chantier comprend une phase Administratif.");
      return null;
    }
    if (avecFabrication === null) {
      setError("Indiquez si le chantier comprend une fabrication.");
      return null;
    }
    if (avecThermolaquage === null) {
      setError("Indiquez si le chantier passe au thermolaquage.");
      return null;
    }
    if (avecLivraison === null) {
      setError("Indiquez si le chantier a une livraison.");
      return null;
    }
    if (avecLivraison) {
      if (!adresseLivraison.trim()) {
        setError("Indiquez l’adresse de livraison.");
        return null;
      }
      if (!telephoneLivraison.trim()) {
        setError("Indiquez le téléphone de la personne qui réceptionne.");
        return null;
      }
      if (!employeLivraison) {
        setError("Choisissez le salarié responsable de la livraison.");
        return null;
      }
    }
    if (urgent && dateFin && dateDebut && dateFin < dateDebut) {
      setError("La date de fin (deadline) doit être après le début.");
      return null;
    }
    setError(null);
    const input: NewChantierInput = {
      nom_client: nomClient.trim(),
      adresse: adresse.trim(),
      lien_dossier_onedrive: lien.trim() || null,
      priorite,
      tolerance_deplacement_jours:
        priorite === "pas_presse" ? moisToToleranceJours(toleranceMois) : null,
      date_debut: dateDebut || null,
      date_fin: urgent ? dateFin || null : null,
      dates_estimatives: datesEstimatives,
      avec_pose: avecPose,
      avec_administratif: avecAdministratif,
      avec_fabrication: avecFabrication,
      avec_thermolaquage: avecThermolaquage,
      avec_livraison: avecLivraison,
      adresse_livraison: avecLivraison ? adresseLivraison.trim() : null,
      telephone_livraison: avecLivraison ? telephoneLivraison.trim() : null,
      delai_laquage_jours: avecThermolaquage
        ? Number(delaiLaquage || 5)
        : null,
      date_laquage_debut: avecThermolaquage ? dateLaquageDebut || null : null,
      date_laquage_fin: avecThermolaquage ? dateLaquageFin || null : null,
      sous_traitant_id: avecThermolaquage ? sousTraitantId || null : null,
      couleur_ral: avecThermolaquage ? couleurRal.trim() || null : null,
      finition: avecThermolaquage ? parseFinitionLaquage(finition) : null,
      elements: namedElements.map((element) => ({
        nom_element: element.nom_element.trim(),
        phases: element.phases.map((phase) => ({
          type_phase: phase.type_phase,
          duree_estimee_heures: hoursForPhase(phase),
          date_debut: phase.date_debut || null,
          date_fin: phase.date_fin || phase.date_debut || null,
          employe_id:
            phase.type_phase === "logistique"
              ? null
              : phase.type_phase === "livraison" && avecLivraison
                ? employeLivraison
                : phase.type_phase === "administratif" &&
                    avecAdministratif &&
                    employeAdministratif
                  ? employeAdministratif
                  : phase.type_phase === "fabrication" &&
                    avecFabrication &&
                    employeFabrication
                  ? employeFabrication
                  : phase.type_phase === "pose" && avecPose && employePose
                    ? employePose
                    : phase.employe_id || null,
          urgent: urgent || phase.urgent,
          heures_supplementaires_par_jour:
            phase.heures_supplementaires_par_jour || 0,
        })),
      })),
    };
    const prepared = withExtraPoseurs(
      applyPhaseChainOnCreate(
        snapshot,
        ensureChantierDatesOnCreate(snapshot, input),
      ),
      poseurIds.slice(1),
    );
    if (urgent && dateFin && dateDebut) {
      let lastEnd = "";
      for (const element of prepared.elements) {
        for (const phase of element.phases) {
          const end = phase.date_fin || "";
          if (end > lastEnd) lastEnd = end;
        }
      }
      const target = firstWorkingOnOrBefore(dateFin);
      if (lastEnd && lastEnd > target) {
        setError(
          "Les durées des phases ne tiennent pas entre le début et la deadline.",
        );
        return null;
      }
    }
    return prepared;
  }

  async function saveInput(input: NewChantierInput) {
    if (hasPendingSignalements(snapshot)) {
      setError(PENDING_CHANTIER_MESSAGE);
      return;
    }
    const clash = inspectManualSlotConflict(snapshot, input);
    if (clash) {
      setSlotConflict(clash);
      setError(
        formatSaveError(
          new Error(clash.message),
          "le chantier n’a pas été enregistré",
        ),
      );
      return;
    }
    setSlotConflict(null);
    const missing = missingRequiredAssignee(input);
    if (missing) {
      setError(missing);
      return;
    }
    setSaving(true);
    try {
      await createChantier(input);
      router.push("/");
    } catch (err) {
      setError(formatSaveError(err, "le chantier n’a pas été enregistré"));
    } finally {
      setSaving(false);
    }
  }

  function patchesFromConflict(result: PlanResult): PhasePatch[] {
    return result.displacements.flatMap((item) =>
      item.phases.map((phase) => ({
        id: phase.phase_id,
        date_debut: phase.date_debut,
        date_fin: phase.date_fin,
        employe_id: phase.employe_id,
      })),
    );
  }

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    const input = buildInput();
    if (!input) return;
    await saveInput(ensureChantierDatesOnCreate(snapshot, input));
  }

  async function onAutoPlace() {
    if (hasPendingSignalements(snapshot)) {
      setError(PENDING_CHANTIER_MESSAGE);
      return;
    }
    const input = buildInput();
    if (!input) return;
    setPlacing(true);
    try {
      const result = planChantier(snapshot, input, { urgent });
      if (result.status === "conflict") {
        setPendingInput(input);
        setConflict(result);
        setInfo(result.message);
        return;
      }
      if (result.status === "blocked") {
        const clash = inspectManualSlotConflict(snapshot, input);
        if (clash) {
          setSlotConflict(clash);
          setError(
            formatSaveError(
              new Error(clash.message),
              "le chantier n’a pas été enregistré",
            ),
          );
        } else {
          setError(result.message);
        }
        return;
      }
      const merged = mergePlanIntoInput(input, result.phases, urgent);
      const placed = result.phases.filter(
        (phase) => phase.date_debut && phase.duree_estimee_heures > 0,
      );
      if (placed.length === 0) {
        setError(
          result.message ||
            "Le moteur n’a posé aucune date. Vérifiez les durées et les rôles de l’équipe.",
        );
      } else {
        setInfo(result.message);
      }
      await saveInput(
        ensureChantierDatesOnCreate(snapshot, {
          ...merged,
          dates_estimatives: inputHasExplicitDates(input)
            ? Boolean(input.dates_estimatives)
            : true,
        }),
      );
    } catch (err) {
      setError(formatSaveError(err, "le chantier n’a pas été enregistré"));
    } finally {
      setPlacing(false);
    }
  }

  async function validateConflict() {
    if (!conflict || !pendingInput) return;
    if (!session?.employeeId) {
      setError("Connexion requise pour envoyer la proposition.");
      return;
    }
    setSaving(true);
    try {
      const merged = mergePlanIntoInput(pendingInput, conflict.phases, urgent);
      const solutions = generatePlanSolutions(
        snapshot,
        pendingInput,
        conflict,
        urgent,
      );
      const proposition =
        propositionFromSolutions(solutions) ??
        propositionFromDelay(
          snapshot,
          {
            message: conflict.message,
            patches: patchesFromConflict(conflict),
            displacements: conflict.displacements,
          },
          { createChantier: merged },
        );
      await createSignalement({
        employe_id: session.employeeId,
        phase_id: null,
        retard_demi_journees: 1,
        sens: "retard",
        note: `Nouveau chantier « ${pendingInput.nom_client} » : plusieurs solutions, non appliquées.`,
        origine: "decalage_admin",
        statut: "en_attente",
        proposition,
      });
      router.push("/signalements");
    } catch (err) {
      setError(formatSaveError(err, "la proposition n’a pas été envoyée"));
    } finally {
      setSaving(false);
      setConflict(null);
    }
  }

  function namedElementKey(index: number): string | null {
    return (
      elements.filter((element) => element.nom_element.trim())[index]?.key ??
      null
    );
  }

  function applySlotToForm(
    type: TypePhase,
    elementIndex: number,
    patch: {
      date_debut?: string;
      date_fin?: string;
      employe_id?: string;
      heures_supplementaires_par_jour?: number;
    },
  ) {
    const key = namedElementKey(elementIndex);
    if (!key) return;
    updatePhase(key, type, patch);
  }

  async function markUrgentAndPlace() {
    setUrgent(true);
    setSlotConflict(null);
    const input = buildInput();
    if (!input) return;
    const forced = {
      ...input,
      elements: input.elements.map((element) => ({
        ...element,
        phases: element.phases.map((phase) => ({ ...phase, urgent: true })),
      })),
    };
    const result = planChantier(snapshot, forced, { urgent: true });
    if (result.status === "conflict") {
      setPendingInput(forced);
      setConflict(result);
      setInfo(result.message);
      return;
    }
    if (result.status === "blocked") {
      setError(result.message);
      return;
    }
    setInfo(result.message);
    await saveInput(
      ensureChantierDatesOnCreate(
        snapshot,
        mergePlanIntoInput(forced, result.phases, true),
      ),
    );
  }

  async function adjustConflict() {
    if (!pendingInput) return;
    const withoutForcedDates: NewChantierInput = {
      ...pendingInput,
      elements: pendingInput.elements.map((element) => ({
        ...element,
        phases: element.phases.map((phase) => ({
          ...phase,
          date_debut: null,
          date_fin: null,
        })),
      })),
    };
    const result = planChantier(snapshot, withoutForcedDates, { urgent: false });
    setConflict(null);
    setInfo(
      "Placement à la suite, sans décalage des chantiers existants. " + result.message,
    );
    await saveInput(
      ensureChantierDatesOnCreate(
        snapshot,
        mergePlanIntoInput(withoutForcedDates, result.phases, urgent),
      ),
    );
  }

  if (loading) {
    return <p className="text-sm text-stone-500">Chargement des salariés…</p>;
  }

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      {conflict && (
        <ConflictModal
          message={conflict.message}
          displacements={conflict.displacements}
          incoming={conflict.phases}
          validateLabel="Envoyer pour validation"
          onValidate={() => void validateConflict()}
          onAdjust={() => void adjustConflict()}
          onCancel={() => setConflict(null)}
        />
      )}

      <div>
        <h2 className="font-serif text-3xl text-stone-900">Nouveau chantier</h2>
        <p className="mt-1 text-sm text-stone-600">
          Indiquez si le chantier a un Administratif, une pose, du thermolaquage et une livraison. Le délai de
          5 jours ouvrés du sous-traitant démarre à l’envoi du bon de commande.
        </p>
        {hasPendingSignalements(snapshot) ? (
          <p className="mt-3 rounded border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-950">
            {PENDING_CHANTIER_MESSAGE}
          </p>
        ) : null}
      </div>

      {error && (
        <p className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      )}
      {info && (
        <p className="rounded border border-stone-200 bg-stone-50 px-3 py-2 text-sm text-stone-700">
          {info}
        </p>
      )}
      {slotConflict && (
        <PlacementConflictPanel
          key={`${slotConflict.elementIndex}-${slotConflict.type_phase}-${slotConflict.date_debut}`}
          conflict={slotConflict}
          onUseSlot={() => {
            if (!slotConflict.nextFree) return;
            applySlotToForm(slotConflict.type_phase, slotConflict.elementIndex, {
              date_debut: slotConflict.nextFree.date_debut,
              date_fin: slotConflict.nextFree.date_fin,
              heures_supplementaires_par_jour: 0,
            });
            setSlotConflict(null);
            setInfo(
              `Dates mises à jour : ${slotConflict.nextFree.date_debut} → ${slotConflict.nextFree.date_fin}. Relancez le placement ou enregistrez.`,
            );
          }}
          onReassign={(employeeId, dates) => {
            applySlotToForm(slotConflict.type_phase, slotConflict.elementIndex, {
              employe_id: employeeId,
              heures_supplementaires_par_jour: 0,
              ...(dates
                ? { date_debut: dates.date_debut, date_fin: dates.date_fin }
                : {}),
            });
            setSlotConflict(null);
            setInfo(
              "Personne et dates mises à jour. Relancez le placement ou enregistrez.",
            );
          }}
          onOvertime={(fit) => {
            applySlotToForm(slotConflict.type_phase, slotConflict.elementIndex, {
              date_debut: fit.date_debut,
              date_fin: fit.date_fin,
              heures_supplementaires_par_jour: fit.extraHoursPerDay,
            });
            setSlotConflict(null);
            setInfo(
              `Phase calée sur ${fit.date_debut} → ${fit.date_fin} avec ${fit.label}. Relancez le placement ou enregistrez.`,
            );
          }}
          onMarkUrgent={() => void markUrgentAndPlace()}
        />
      )}

      <div className="grid gap-4 rounded-lg border border-stone-300 bg-white p-4 md:grid-cols-2">
        <label className="block text-sm">
          <span className="mb-1 block font-medium">Nom client</span>
          <input
            required
            value={nomClient}
            onChange={(event) => setNomClient(event.target.value)}
            className="w-full rounded border border-stone-300 px-3 py-2"
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block font-medium">Priorité</span>
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
            <span className="mb-1 block font-medium">Marge de déplacement</span>
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
            <span className="mt-1 block text-xs text-stone-500">
              En cas de conflit, l’algorithme pourra décaler ce chantier dans
              cette fenêtre (1 mois par défaut).
            </span>
          </label>
        ) : priorite === "normal" ? (
          <p className="self-end text-xs text-stone-500">
            Marge automatique : ± 2 semaines.
          </p>
        ) : (
          <p className="self-end text-xs text-stone-500">
            Date à tenir exactement : les autres affaires bougent d’abord.
          </p>
        )}
        <label className="flex items-center gap-2 text-sm md:col-span-2">
          <input
            type="checkbox"
            checked={urgent}
            onChange={(event) => {
              const next = event.target.checked;
              setUrgent(next);
              if (!next) setDateFin("");
            }}
          />
          <span className="font-medium">Chantier urgent</span>
          <span className="text-stone-500">
            (insertion possible entre deux affaires, après validation)
          </span>
        </label>
        <fieldset className="md:col-span-2 rounded-lg border border-violet-200 bg-violet-50/40 p-3">
          <legend className="px-1 text-sm font-medium text-stone-800">
            Dates du chantier (toute la chaîne)
          </legend>
          <p className="text-xs text-stone-600">
            Le début est le premier jour de la première phase : Administratif
            s’il a une durée plus bas, sinon Fabrication, sinon Pose. Les
            phases suivantes (thermolaquage, livraison, pose) se calent à la
            suite. Laissez le début vide pour un calage automatique au plus tôt.
            En urgent, la date de fin est le dernier jour de la dernière phase
            (souvent la Pose) : le planning se cale à rebours. Les durées se
            choisissent plus bas, par phase.
          </p>
          <div className="mt-2 grid gap-3 sm:grid-cols-2">
            <label className="block text-sm">
              <span className="mb-1 block font-medium">
                Début (1re phase)
              </span>
              <input
                type="date"
                value={dateDebut}
                onChange={(event) => setChantierDebut(event.target.value)}
                className="w-full rounded border border-stone-300 bg-white px-3 py-2"
              />
            </label>
            {urgent ? (
              <label className="block text-sm">
                <span className="mb-1 block font-medium">
                  Fin (deadline, dernière phase)
                </span>
                <input
                  type="date"
                  value={dateFin}
                  min={dateDebut || undefined}
                  onChange={(event) => setDateFin(event.target.value)}
                  className="w-full rounded border border-stone-300 bg-white px-3 py-2"
                />
              </label>
            ) : null}
          </div>
          <div className="mt-3 flex flex-wrap gap-4 text-sm">
            <label className="inline-flex items-center gap-2">
              <input
                type="radio"
                name="dates-kind"
                checked={datesEstimatives}
                onChange={() => setDatesEstimatives(true)}
              />
              Estimatif
            </label>
            <label className="inline-flex items-center gap-2">
              <input
                type="radio"
                name="dates-kind"
                checked={!datesEstimatives}
                onChange={() => setDatesEstimatives(false)}
              />
              Confirmé
            </label>
          </div>
        </fieldset>
        <fieldset className="rounded-lg border border-stone-300 bg-stone-50/60 p-3 text-sm md:col-span-2">
          <legend className="px-1 font-medium text-stone-800">
            Administratif <span className="text-red-700">*</span>
          </legend>
          <div className="flex flex-wrap gap-4">
            <label className="inline-flex items-center gap-2">
              <input
                type="radio"
                name="avec-administratif"
                required
                checked={avecAdministratif === true}
                onChange={() => setAvecAdministratif(true)}
              />
              Oui
            </label>
            <label className="inline-flex items-center gap-2">
              <input
                type="radio"
                name="avec-administratif"
                required
                checked={avecAdministratif === false}
                onChange={() => setAvecAdministratif(false)}
              />
              Non
            </label>
          </div>
          {avecAdministratif ? (
            <label className="mt-3 block">
              <span className="mb-1 block font-medium">
                Salarié responsable de l’administratif
              </span>
              <EmployeePhaseSelect
                employees={employeesByRole}
                type="administratif"
                value={employeAdministratif}
                onChange={setEmployeAdministratif}
                emptyLabel="Auto (premier disponible)"
                className="w-full rounded border border-stone-300 bg-white px-3 py-2"
              />
            </label>
          ) : null}
        </fieldset>
        <fieldset className="rounded-lg border border-stone-300 bg-stone-50/60 p-3 text-sm md:col-span-2">
          <legend className="px-1 font-medium text-stone-800">
            Installation / Pose <span className="text-red-700">*</span>
          </legend>
          <div className="flex flex-wrap gap-4">
            <label className="inline-flex items-center gap-2">
              <input
                type="radio"
                name="avec-pose"
                required
                checked={avecPose === true}
                onChange={() => setAvecPose(true)}
              />
              Oui
            </label>
            <label className="inline-flex items-center gap-2">
              <input
                type="radio"
                name="avec-pose"
                required
                checked={avecPose === false}
                onChange={() => setAvecPose(false)}
              />
              Non
            </label>
          </div>
          {avecPose ? (
            <div className="mt-3 space-y-2">
              <span className="mb-1 block font-medium">Poseurs</span>
              <p className="text-xs text-stone-600">
                Cochez un ou plusieurs poseurs. Si vous n’en choisissez aucun,
                le premier disponible est pris tout seul.
              </p>
              <div className="flex flex-col gap-1">
                {poseCandidates.map((employee) => {
                  const suggested = suggestedPoseurs.some(
                    (item) => item.id === employee.id,
                  );
                  return (
                    <label
                      key={employee.id}
                      className="inline-flex items-center gap-2 text-sm"
                    >
                      <input
                        type="checkbox"
                        checked={poseurIds.includes(employee.id)}
                        onChange={() => togglePoseur(employee.id)}
                      />
                      <span>{employee.nom}</span>
                      {poseDateDebut ? (
                        <span
                          className={
                            suggested
                              ? "text-xs text-emerald-700"
                              : "text-xs text-stone-400"
                          }
                        >
                          {suggested ? "libre sur les dates de pose" : "pas dispo ce jour-là"}
                        </span>
                      ) : null}
                    </label>
                  );
                })}
              </div>
              {poseDateDebut && suggestedPoseurs.length === 0 ? (
                <p className="text-xs text-amber-800">
                  Aucun poseur n’est libre sur ces dates. Vous pouvez quand
                  même en cocher un.
                </p>
              ) : null}
            </div>
          ) : null}
        </fieldset>
        <fieldset className="rounded-lg border border-stone-300 bg-stone-50/60 p-3 text-sm md:col-span-2">
          <legend className="px-1 font-medium text-stone-800">
            Fabrication <span className="text-red-700">*</span>
          </legend>
          <div className="flex flex-wrap gap-4">
            <label className="inline-flex items-center gap-2">
              <input
                type="radio"
                name="avec-fabrication"
                required
                checked={avecFabrication === true}
                onChange={() => setAvecFabrication(true)}
              />
              Oui
            </label>
            <label className="inline-flex items-center gap-2">
              <input
                type="radio"
                name="avec-fabrication"
                required
                checked={avecFabrication === false}
                onChange={() => setAvecFabrication(false)}
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
                employees={employeesByRole}
                type="fabrication"
                value={employeFabrication}
                onChange={setEmployeFabrication}
                emptyLabel="Auto (premier disponible)"
                className="w-full rounded border border-stone-300 bg-white px-3 py-2"
              />
            </label>
          ) : null}
        </fieldset>
        <fieldset className="rounded-lg border border-stone-300 bg-stone-50/60 p-3 text-sm md:col-span-2">
          <legend className="px-1 font-medium text-stone-800">
            Thermolaquage <span className="text-red-700">*</span>
          </legend>
          <div className="flex flex-wrap gap-4">
            <label className="inline-flex items-center gap-2">
              <input
                type="radio"
                name="avec-thermolaquage"
                required
                checked={avecThermolaquage === true}
                onChange={() => setAvecThermolaquage(true)}
              />
              Oui
            </label>
            <label className="inline-flex items-center gap-2">
              <input
                type="radio"
                name="avec-thermolaquage"
                required
                checked={avecThermolaquage === false}
                onChange={() => setAvecThermolaquage(false)}
              />
              Non
            </label>
          </div>
          {avecThermolaquage ? (
            <div className="mt-3 grid gap-3 sm:grid-cols-3">
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
              <label className="block">
                <span className="mb-1 block font-medium">Début précis (optionnel)</span>
                <input
                  type="date"
                  value={dateLaquageDebut}
                  onChange={(event) => setDateLaquageDebut(event.target.value)}
                  className="w-full rounded border border-stone-300 bg-white px-3 py-2"
                />
              </label>
              <label className="block">
                <span className="mb-1 block font-medium">Fin précise (optionnelle)</span>
                <input
                  type="date"
                  value={dateLaquageFin}
                  min={dateLaquageDebut || undefined}
                  onChange={(event) => setDateLaquageFin(event.target.value)}
                  className="w-full rounded border border-stone-300 bg-white px-3 py-2"
                />
              </label>
              <div className="sm:col-span-3">
                <SousTraitantSelect
                  value={sousTraitantId}
                  onChange={setSousTraitantId}
                  rows={snapshot.sousTraitants ?? []}
                />
              </div>
              <label className="block">
                <span className="mb-1 block font-medium">Couleur RAL</span>
                <input
                  value={couleurRal}
                  onChange={(event) => setCouleurRal(event.target.value)}
                  placeholder="ex. RAL 7016"
                  className="w-full rounded border border-stone-300 bg-white px-3 py-2"
                />
              </label>
              <label className="block">
                <span className="mb-1 block font-medium">Finition</span>
                <select
                  value={finition}
                  onChange={(event) =>
                    setFinition(
                      parseFinitionLaquage(event.target.value) ?? "",
                    )
                  }
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
              <p className="text-xs text-stone-500 sm:col-span-3">
                Sans dates précises, le thermolaquage n’est plus calé à la
                création. Le délai officiel de 5 jours ouvrés démarre à l’envoi
                du bon de commande.
              </p>
            </div>
          ) : null}
        </fieldset>
        <fieldset className="rounded-lg border border-stone-300 bg-stone-50/60 p-3 text-sm md:col-span-2">
          <legend className="px-1 font-medium text-stone-800">
            Livraison <span className="text-red-700">*</span>
          </legend>
          <div className="flex flex-wrap gap-4">
            <label className="inline-flex items-center gap-2">
              <input
                type="radio"
                name="avec-livraison"
                required
                checked={avecLivraison === true}
                onChange={() => setAvecLivraison(true)}
              />
              Oui
            </label>
            <label className="inline-flex items-center gap-2">
              <input
                type="radio"
                name="avec-livraison"
                required
                checked={avecLivraison === false}
                onChange={() => setAvecLivraison(false)}
              />
              Non
            </label>
          </div>
          {avecLivraison ? (
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <label className="block sm:col-span-2">
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
              <label className="block sm:col-span-2">
                <span className="mb-1 block font-medium">
                  Salarié responsable de la livraison
                </span>
                <select
                  value={employeLivraison}
                  onChange={(event) => setEmployeLivraison(event.target.value)}
                  className="w-full rounded border border-stone-300 bg-white px-3 py-2"
                >
                  <option value="">Choisir…</option>
                  {employeesByRole.map((employee) => (
                    <option key={employee.id} value={employee.id}>
                      {employee.nom}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          ) : null}
        </fieldset>
        <label className="block text-sm md:col-span-2">
          <span className="mb-1 block font-medium">Adresse</span>
          <input
            value={adresse}
            onChange={(event) => setAdresse(event.target.value)}
            className="w-full rounded border border-stone-300 px-3 py-2"
          />
        </label>
        <label className="block text-sm md:col-span-2">
          <span className="mb-1 block font-medium">Lien dossier OneDrive</span>
          <input
            type="url"
            value={lien}
            onChange={(event) => setLien(event.target.value)}
            placeholder="https://"
            className="w-full rounded border border-stone-300 px-3 py-2"
          />
        </label>
      </div>

      <div className="space-y-4">
        {elements.map((element, index) => (
          <div
            key={element.key}
            className="space-y-3 rounded-lg border border-stone-300 bg-white p-4"
          >
            <div className="flex items-center justify-between gap-3">
              <h3 className="font-medium">Élément {index + 1}</h3>
              {elements.length > 1 && (
                <button
                  type="button"
                  className="text-sm text-red-700"
                  onClick={() =>
                    setElements((current) =>
                      current.filter((item) => item.key !== element.key),
                    )
                  }
                >
                  Retirer
                </button>
              )}
            </div>
            <label className="block text-sm">
              <span className="mb-1 block font-medium">
                Nom (pergola, portail, table…)
              </span>
              <input
                value={element.nom_element}
                onChange={(event) =>
                  updateElement(element.key, { nom_element: event.target.value })
                }
                className="w-full rounded border border-stone-300 px-3 py-2"
              />
            </label>
            <div className="overflow-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wide text-stone-500">
                    <th className="py-2 pr-2">Phase</th>
                    <th className="py-2 pr-2">Durée</th>
                    <th className="py-2 pr-2">Personne</th>
                  </tr>
                </thead>
                <tbody>
                  {element.phases
                    .filter((phase) => {
                      if (phase.type_phase === "pose" && avecPose === false) {
                        return false;
                      }
                      if (
                        phase.type_phase === "administratif" &&
                        avecAdministratif !== true
                      ) {
                        return false;
                      }
                      if (
                        phase.type_phase === "fabrication" &&
                        avecFabrication !== true
                      ) {
                        return false;
                      }
                      if (
                        phase.type_phase === "logistique" &&
                        avecThermolaquage === false
                      ) {
                        return false;
                      }
                      if (phase.type_phase === "livraison" && avecLivraison === false) {
                        return false;
                      }
                      return true;
                    })
                    .map((phase) => (
                    <tr key={phase.type_phase} className="border-t border-stone-200">
                      <td className="py-2 pr-2">{PHASE_LABELS[phase.type_phase]}</td>
                      <td className="py-2 pr-2">
                        <PhaseDureeFields
                          hours={phase.duree_estimee_heures}
                          snapshot={snapshot}
                          employeeId={employeeIdForPhaseHours(phase)}
                          ariaLabel={`Durée — ${PHASE_LABELS[phase.type_phase]}`}
                          onHoursChange={(hours) =>
                            setPhaseHoursValue(
                              element.key,
                              phase.type_phase,
                              hours,
                            )
                          }
                        />
                      </td>
                      <td className="py-2 pr-2">
                        {phase.type_phase === "logistique" ? (
                          <span className="text-stone-500">Thermolaquage</span>
                        ) : (
                          <select
                            autoComplete="off"
                            value={coercePhasePersonValue(
                              snapshot,
                              employeesByRole,
                              phase,
                            )}
                            onChange={(event) =>
                              updatePhase(element.key, phase.type_phase, {
                                employe_id: event.target.value,
                              })
                            }
                            className="rounded border border-stone-300 px-2 py-1"
                          >
                            <option value="">Auto / non assigné</option>
                            {employeesForPhaseRow(
                              snapshot,
                              employeesByRole,
                              phase,
                            ).map((employee) => (
                              <option key={employee.id} value={employee.id}>
                                {employee.nom}
                              </option>
                            ))}
                          </select>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ))}
        <button
          type="button"
          onClick={() =>
            setElements((current) => [
              ...current,
              {
                key: `el-${current.length + 1}-${Date.now()}`,
                nom_element: "",
                phases: emptyPhases(),
              },
            ])
          }
          className="rounded border border-dashed border-stone-400 px-3 py-2 text-sm text-stone-700"
        >
          + Ajouter un élément
        </button>
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={saving || placing || hasPendingSignalements(snapshot)}
          onClick={() => void onAutoPlace()}
          className="rounded bg-amber-700 px-4 py-2 text-sm font-medium text-amber-50 disabled:opacity-60"
        >
          {placing ? "Placement…" : "Placer automatiquement"}
        </button>
        <button
          type="submit"
          disabled={saving || placing || hasPendingSignalements(snapshot)}
          className="rounded border border-stone-400 bg-white px-4 py-2 text-sm font-medium text-stone-800 disabled:opacity-60"
        >
          {saving ? "Enregistrement…" : "Enregistrer"}
        </button>
      </div>
    </form>
  );
}
