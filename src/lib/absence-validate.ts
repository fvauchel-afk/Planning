import {
  listImpactedPhases,
  planAbsenceImprevue,
} from "@/lib/engine/absence-imprevue";
import { delayTouchesPrioritaire } from "@/lib/engine/delay";
import type { NewAbsenceInput, PlanningSnapshot } from "@/lib/types";

/** Payload used by « Envoyer pour validation » — never require the review overlay. */
export function payloadForAbsenceValidation(
  reviewPayload: NewAbsenceInput | null,
  formPayload: NewAbsenceInput | null,
): NewAbsenceInput | null {
  return reviewPayload ?? formPayload;
}

function runAbsenceValidateSelfCheck() {
  const alexis = "alexis";
  const absenceId = "absence-alexis";
  const snapshot: PlanningSnapshot = {
    employees: [
      {
        id: alexis,
        nom: "Alexis",
        roles: ["fabrication", "pose"],
        actif: true,
      },
    ],
    chantiers: [
      {
        id: "laquage",
        nom_client: "essaie laquage",
        adresse: "",
        lien_dossier_onedrive: null,
        priorite: "normal",
        date_creation: "2026-09-01",
      },
      {
        id: "dupont",
        nom_client: "Portail Dupont",
        adresse: "",
        lien_dossier_onedrive: null,
        priorite: "prioritaire",
        date_creation: "2026-09-01",
      },
    ],
    elements: [
      { id: "el-laq", chantier_id: "laquage", nom_element: "thermo" },
      { id: "el-dupont", chantier_id: "dupont", nom_element: "Portail" },
    ],
    phases: [
      {
        id: "fab-laq",
        element_id: "el-laq",
        type_phase: "fabrication",
        duree_estimee_heures: 14,
        date_debut: "2026-09-18",
        date_fin: "2026-09-21",
        heure_debut: null,
        employe_id: alexis,
        statut: "a_faire",
        urgent: false,
      },
      {
        id: "pose-dupont",
        element_id: "el-dupont",
        type_phase: "pose",
        duree_estimee_heures: 8,
        date_debut: "2026-09-22",
        date_fin: "2026-09-23",
        heure_debut: null,
        employe_id: alexis,
        statut: "a_faire",
        urgent: false,
      },
    ],
    absences: [
      {
        id: absenceId,
        employe_id: alexis,
        date_debut: "2026-09-17",
        date_fin: "2026-09-18",
        type: "conge",
        motif_precision: null,
      },
    ],
    signalements: [],
    receptions: [],
    demandes: [],
    horaires: [],
  };
  const payload: NewAbsenceInput = {
    employe_id: alexis,
    type: "conge",
    date_debut: "2026-09-17",
    date_fin: "2026-09-18",
    motif_precision: null,
  };
  const overlapWithRecordedAbsence = listImpactedPhases(
    snapshot,
    payload.employe_id,
    payload.date_debut,
    payload.date_fin,
  );
  if (overlapWithRecordedAbsence.length !== 0) {
    throw new Error(
      "absence-validate: une absence déjà enregistrée ne doit pas lister ses propres créneaux comme un nouveau chevauchement",
    );
  }
  const plan = planAbsenceImprevue(snapshot, payload, {}, { ignoreAbsenceId: absenceId });
  const needsPlacementConflict =
    plan.status === "conflict" || delayTouchesPrioritaire(snapshot, plan.patches);
  if (!needsPlacementConflict) {
    throw new Error(
      "absence-validate: réenregistrer le congé doit ouvrir le conflit de placement",
    );
  }
  const stopped =
    payloadForAbsenceValidation(null, null) === null &&
    payloadForAbsenceValidation(null, payload) === payload;
  if (!stopped) {
    throw new Error(
      "absence-validate: Envoyer pour validation doit utiliser le formulaire si la revue est vide",
    );
  }
}

runAbsenceValidateSelfCheck();
