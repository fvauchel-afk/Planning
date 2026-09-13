"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { ConflictModal } from "@/components/ConflictModal";
import { compareEmployeesByOrdre } from "@/lib/display-order";
import { employeeAvailableOnRange } from "@/lib/engine/hours";
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
import { applyPhaseChainOnCreate } from "@/lib/engine/phase-chain";
import { usePlanning } from "@/lib/planning-context";
import {
  PHASE_LABELS,
  PRIORITES,
  PRIORITE_LABELS,
  TYPES_PHASE,
  type NewChantierInput,
  type PhasePatch,
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
  const { snapshot, createChantier, createChantierWithPatches } = usePlanning();
  const [nomClient, setNomClient] = useState("");
  const [adresse, setAdresse] = useState("");
  const [lien, setLien] = useState("");
  const [priorite, setPriorite] = useState<Priorite>("normal");
  const [urgent, setUrgent] = useState(false);
  const [dateDebut, setDateDebut] = useState("");
  const [dateFin, setDateFin] = useState("");
  const [datesEstimatives, setDatesEstimatives] = useState(true);
  const [avecPose, setAvecPose] = useState<boolean | null>(null);
  const [avecThermolaquage, setAvecThermolaquage] = useState<boolean | null>(null);
  const [delaiLaquage, setDelaiLaquage] = useState("5");
  const [dateLaquageDebut, setDateLaquageDebut] = useState("");
  const [dateLaquageFin, setDateLaquageFin] = useState("");
  const [elements, setElements] = useState<ElementForm[]>([
    { key: "el-1", nom_element: "", phases: emptyPhases() },
  ]);
  const [saving, setSaving] = useState(false);
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
    if (avecThermolaquage === null) {
      setError("Indiquez si le chantier passe au thermolaquage.");
      return null;
    }
    setError(null);
    const input: NewChantierInput = {
      nom_client: nomClient.trim(),
      adresse: adresse.trim(),
      lien_dossier_onedrive: lien.trim() || null,
      priorite,
      date_debut: dateDebut || null,
      date_fin: dateFin || dateDebut || null,
      dates_estimatives: datesEstimatives,
      avec_pose: avecPose,
      avec_thermolaquage: avecThermolaquage,
      delai_laquage_jours: avecThermolaquage
        ? Number(delaiLaquage || 5)
        : null,
      date_laquage_debut: avecThermolaquage ? dateLaquageDebut || null : null,
      date_laquage_fin: avecThermolaquage ? dateLaquageFin || null : null,
      elements: namedElements.map((element) => ({
        nom_element: element.nom_element.trim(),
        phases: element.phases.map((phase) => ({
          type_phase: phase.type_phase,
          duree_estimee_heures: Number(phase.duree_estimee_heures || 0),
          date_debut: phase.date_debut || null,
          date_fin: phase.date_fin || phase.date_debut || null,
          employe_id:
            phase.type_phase === "logistique" ? null : phase.employe_id || null,
          urgent: urgent || phase.urgent,
          heures_supplementaires_par_jour:
            phase.heures_supplementaires_par_jour || 0,
        })),
      })),
    };
    return applyPhaseChainOnCreate(
      snapshot,
      ensureChantierDatesOnCreate(snapshot, input),
    );
  }

  async function saveInput(input: NewChantierInput) {
    const clash = inspectManualSlotConflict(snapshot, input);
    if (clash) {
      setSlotConflict(clash);
      setError(null);
      return;
    }
    setSlotConflict(null);
    setSaving(true);
    try {
      await createChantier(input);
      router.push("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Enregistrement impossible.");
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
    const input = buildInput();
    if (!input) return;
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
        setError(null);
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
  }

  async function validateConflict() {
    if (!conflict || !pendingInput) return;
    setSaving(true);
    try {
      await createChantierWithPatches(
        mergePlanIntoInput(pendingInput, conflict.phases, urgent),
        patchesFromConflict(conflict),
      );
      router.push("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Enregistrement impossible.");
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

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      {conflict && (
        <ConflictModal
          message={conflict.message}
          displacements={conflict.displacements}
          incoming={conflict.phases}
          onValidate={() => void validateConflict()}
          onAdjust={() => void adjustConflict()}
          onCancel={() => setConflict(null)}
        />
      )}

      <div>
        <h2 className="font-serif text-3xl text-stone-900">Nouveau chantier</h2>
        <p className="mt-1 text-sm text-stone-600">
          Indiquez si le chantier a une pose et du thermolaquage. Le délai de
          5 jours ouvrés du sous-traitant démarre à l’envoi du bon de commande.
        </p>
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
        <label className="flex items-center gap-2 text-sm md:col-span-2">
          <input
            type="checkbox"
            checked={urgent}
            onChange={(event) => setUrgent(event.target.checked)}
          />
          <span className="font-medium">Chantier urgent</span>
          <span className="text-stone-500">
            (insertion possible entre deux affaires, après validation)
          </span>
        </label>
        <fieldset className="md:col-span-2 rounded-lg border border-violet-200 bg-violet-50/40 p-3">
          <legend className="px-1 text-sm font-medium text-stone-800">
            Dates du chantier
          </legend>
          <p className="text-xs text-stone-600">
            Laissez vide pour un calage automatique au plus tôt. Les dates
            estimatives restent visuellement distinctes tant qu’elles ne sont
            pas confirmées.
          </p>
          <div className="mt-2 grid gap-3 sm:grid-cols-2">
            <label className="block text-sm">
              <span className="mb-1 block font-medium">Début</span>
              <input
                type="date"
                value={dateDebut}
                onChange={(event) => {
                  const next = event.target.value;
                  setDateDebut(next);
                  if (dateFin && next && dateFin < next) setDateFin(next);
                }}
                className="w-full rounded border border-stone-300 bg-white px-3 py-2"
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block font-medium">Fin (optionnel)</span>
              <input
                type="date"
                value={dateFin}
                min={dateDebut || undefined}
                onChange={(event) => setDateFin(event.target.value)}
                className="w-full rounded border border-stone-300 bg-white px-3 py-2"
              />
            </label>
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
              <p className="text-xs text-stone-500 sm:col-span-3">
                Sans dates précises, le thermolaquage n’est plus calé à la
                création. Le délai officiel de 5 jours ouvrés démarre à l’envoi
                du bon de commande.
              </p>
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
                    <th className="py-2 pr-2">Heures</th>
                    <th className="py-2 pr-2">Début</th>
                    <th className="py-2 pr-2">Fin</th>
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
                        phase.type_phase === "logistique" &&
                        avecThermolaquage === false
                      ) {
                        return false;
                      }
                      return true;
                    })
                    .map((phase) => (
                    <tr key={phase.type_phase} className="border-t border-stone-200">
                      <td className="py-2 pr-2">{PHASE_LABELS[phase.type_phase]}</td>
                      <td className="py-2 pr-2">
                        <input
                          type="number"
                          min="0"
                          step="0.5"
                          value={phase.duree_estimee_heures}
                          onChange={(event) =>
                            updatePhase(element.key, phase.type_phase, {
                              duree_estimee_heures: event.target.value,
                            })
                          }
                          className="w-20 rounded border border-stone-300 px-2 py-1"
                        />
                      </td>
                      <td className="py-2 pr-2">
                        <input
                          type="date"
                          value={phase.date_debut}
                          onChange={(event) =>
                            updatePhase(element.key, phase.type_phase, {
                              date_debut: event.target.value,
                            })
                          }
                          className="rounded border border-stone-300 px-2 py-1"
                        />
                      </td>
                      <td className="py-2 pr-2">
                        <input
                          type="date"
                          value={phase.date_fin}
                          onChange={(event) =>
                            updatePhase(element.key, phase.type_phase, {
                              date_fin: event.target.value,
                            })
                          }
                          className="rounded border border-stone-300 px-2 py-1"
                        />
                      </td>
                      <td className="py-2 pr-2">
                        {phase.type_phase === "logistique" ? (
                          <span className="text-stone-500">Thermolaquage</span>
                        ) : (
                          <select
                            value={phase.employe_id}
                            onChange={(event) =>
                              updatePhase(element.key, phase.type_phase, {
                                employe_id: event.target.value,
                              })
                            }
                            className="rounded border border-stone-300 px-2 py-1"
                          >
                            <option value="">Auto / non assigné</option>
                            {employeesByRole
                              .filter((employee) =>
                                employee.roles.includes(phase.type_phase),
                              )
                              .filter((employee) =>
                                employeeAvailableOnRange(
                                  snapshot,
                                  employee,
                                  phase.date_debut || null,
                                  phase.date_fin || phase.date_debut || null,
                                ),
                              )
                              .map((employee) => (
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
          disabled={saving}
          onClick={() => void onAutoPlace()}
          className="rounded bg-amber-700 px-4 py-2 text-sm font-medium text-amber-50 disabled:opacity-60"
        >
          {saving ? "Placement…" : "Placer automatiquement"}
        </button>
        <button
          type="submit"
          disabled={saving}
          className="rounded border border-stone-400 bg-white px-4 py-2 text-sm font-medium text-stone-800 disabled:opacity-60"
        >
          Enregistrer
        </button>
      </div>
    </form>
  );
}
