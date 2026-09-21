import { extraAutoPoseurCount, pickDistinctEmployeesForPhase } from "@/lib/engine/phase-chain";
import type { NewChantierInput, PhaseInsert, PlanningSnapshot } from "@/lib/types";

/** Poseurs nommés en plus du 1er, puis N poseurs auto libres (hors déjà pris). */
export function extraPoseurIdsAfterChain(
  snapshot: PlanningSnapshot,
  input: NewChantierInput,
  namedPoseurIds: string[],
  extraAuto: number,
): string[] {
  const named = namedPoseurIds.filter(Boolean);
  const pose = input.elements
    .flatMap((element) => element.phases)
    .find((phase) => phase.type_phase === "pose");
  const taken = new Set(named);
  if (pose?.employe_id) taken.add(pose.employe_id);
  const autos = pickDistinctEmployeesForPhase(
    snapshot,
    "pose",
    pose?.date_debut ?? null,
    pose?.date_fin ?? pose?.date_debut ?? null,
    extraAutoPoseurCount(named.length, extraAuto),
    taken,
  );
  return [...named.slice(1), ...autos];
}

/** +1 / +2 sur un chantier déjà posé : une ligne Pose en plus par personne, mêmes dates. */
export function extraPosePhaseInsertsForChantier(
  snapshot: PlanningSnapshot,
  chantierId: string,
  extraAuto: number,
): PhaseInsert[] {
  const want = Math.max(0, Math.min(2, Math.floor(extraAuto) || 0));
  if (want === 0) return [];
  const elementIds = snapshot.elements
    .filter((element) => element.chantier_id === chantierId)
    .map((element) => element.id);
  const inserts: PhaseInsert[] = [];
  const takenGlobal = new Set<string>();
  for (const elementId of elementIds) {
    const poses = snapshot.phases.filter(
      (phase) => phase.element_id === elementId && phase.type_phase === "pose",
    );
    const template =
      poses.find((phase) => phase.date_debut) ?? poses[0];
    if (!template) continue;
    for (const phase of poses) {
      if (phase.employe_id) takenGlobal.add(phase.employe_id);
    }
    const ids = pickDistinctEmployeesForPhase(
      snapshot,
      "pose",
      template.date_debut,
      template.date_fin || template.date_debut,
      want,
      takenGlobal,
    );
    for (const employeId of ids) {
      takenGlobal.add(employeId);
      inserts.push({
        element_id: elementId,
        type_phase: "pose",
        duree_estimee_heures: Number(template.duree_estimee_heures) || 8,
        date_debut: template.date_debut,
        date_fin: template.date_fin || template.date_debut,
        heure_debut: template.heure_debut ?? "07:30",
        employe_id: employeId,
        statut: template.statut ?? "a_faire",
        urgent: Boolean(template.urgent),
        heures_supplementaires_par_jour:
          template.heures_supplementaires_par_jour ?? 0,
        dates_estimatives: Boolean(template.dates_estimatives),
      });
    }
  }
  return inserts;
}

function runPoseursAutoSelfCheck() {
  const snapshot: PlanningSnapshot = {
    employees: [
      { id: "p1", nom: "Raphaël", roles: ["pose"], actif: true },
      { id: "p2", nom: "Romain", roles: ["pose"], actif: true },
      { id: "p3", nom: "Ethan", roles: ["pose"], actif: true },
    ],
    chantiers: [
      {
        id: "ch1",
        nom_client: "Test",
        adresse: "",
        lien_dossier_onedrive: null,
        priorite: "normal",
        date_creation: "2026-09-01",
      },
    ],
    elements: [{ id: "el1", chantier_id: "ch1", nom_element: "Portail" }],
    phases: [
      {
        id: "ph1",
        element_id: "el1",
        type_phase: "pose",
        duree_estimee_heures: 8,
        date_debut: "2026-09-22",
        date_fin: "2026-09-22",
        heure_debut: "07:30",
        employe_id: "p1",
        statut: "a_faire",
        urgent: false,
      },
    ],
    absences: [],
    signalements: [],
    receptions: [],
    demandes: [],
    horaires: [],
  };
  const plusOne = extraPosePhaseInsertsForChantier(snapshot, "ch1", 1);
  if (plusOne.length !== 1 || plusOne[0]?.employe_id !== "p2") {
    throw new Error("poseurs-auto: +1 en édition ajoute un poseur distinct");
  }
  if (extraPosePhaseInsertsForChantier(snapshot, "ch1", 0).length !== 0) {
    throw new Error("poseurs-auto: +0 n’ajoute personne");
  }
}
runPoseursAutoSelfCheck();
