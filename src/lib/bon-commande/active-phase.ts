import { dateInRange, toISODate } from "@/lib/dates";
import { TYPES_PHASE, type PlanningSnapshot, type TypePhase } from "@/lib/types";

export function chantierPhases(
  snapshot: PlanningSnapshot,
  chantierId: string,
) {
  const elementIds = new Set(
    snapshot.elements
      .filter((element) => element.chantier_id === chantierId)
      .map((element) => element.id),
  );
  return snapshot.phases.filter((phase) => elementIds.has(phase.element_id));
}

export function activePhaseType(
  snapshot: PlanningSnapshot,
  chantierId: string,
  today = toISODate(new Date()),
): TypePhase | null {
  const phases = chantierPhases(snapshot, chantierId);
  const current = phases.find((phase) => {
    if (!phase.date_debut) return false;
    const end = phase.date_fin || phase.date_debut;
    return dateInRange(today, phase.date_debut, end);
  });
  if (current) return current.type_phase;
  for (const type of TYPES_PHASE) {
    const phase = phases.find((item) => item.type_phase === type);
    if (phase && phase.statut !== "termine") return type;
  }
  return null;
}

export function canGenerateBonCommande(
  snapshot: PlanningSnapshot,
  chantierId: string,
): boolean {
  return chantierPhases(snapshot, chantierId).some(
    (phase) =>
      phase.type_phase === "logistique" &&
      (Boolean(phase.date_debut) || Number(phase.duree_estimee_heures) > 0),
  );
}

function runBonCommandeGateSelfCheck() {
  const snapshot: PlanningSnapshot = {
    employees: [],
    chantiers: [
      {
        id: "c1",
        nom_client: "TEST",
        adresse: "",
        lien_dossier_onedrive: null,
        priorite: "normal",
        date_creation: "2026-09-01",
      },
    ],
    elements: [{ id: "e1", chantier_id: "c1", nom_element: "Portail" }],
    phases: [
      {
        id: "p-fab",
        element_id: "e1",
        type_phase: "fabrication",
        duree_estimee_heures: 8,
        date_debut: "2026-09-14",
        date_fin: "2026-09-17",
        employe_id: "jon",
        statut: "termine",
        urgent: false,
      },
      {
        id: "p-log",
        element_id: "e1",
        type_phase: "logistique",
        duree_estimee_heures: 40,
        date_debut: "2026-09-18",
        date_fin: "2026-09-24",
        employe_id: null,
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
  if (activePhaseType(snapshot, "c1", "2026-09-20") !== "logistique") {
    throw new Error("bon-commande: aujourd’hui dans le laquage → logistique");
  }
  if (!canGenerateBonCommande(snapshot, "c1")) {
    throw new Error(
      "bon-commande: un chantier avec thermolaquage doit pouvoir générer un BC",
    );
  }
}

runBonCommandeGateSelfCheck();
