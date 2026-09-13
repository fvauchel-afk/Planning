import { dateInRange, toISODate } from "@/lib/dates";
import type { PhasePlanning, PlanningSnapshot } from "@/lib/types";

export function phaseIsEstimative(phase: PhasePlanning | null | undefined): boolean {
  return Boolean(phase?.dates_estimatives);
}

export function phaseContainsDate(
  phase: Pick<PhasePlanning, "date_debut" | "date_fin">,
  iso: string,
): boolean {
  if (!phase.date_debut) return false;
  const end = phase.date_fin || phase.date_debut;
  return dateInRange(iso, phase.date_debut, end);
}

export function chantierHasEstimativeDates(
  snapshot: PlanningSnapshot,
  chantierId: string,
): boolean {
  const elementIds = new Set(
    snapshot.elements
      .filter((element) => element.chantier_id === chantierId)
      .map((element) => element.id),
  );
  return snapshot.phases.some(
    (phase) => elementIds.has(phase.element_id) && phaseIsEstimative(phase),
  );
}

export function phaseIdsStartedToday(
  snapshot: PlanningSnapshot,
  today = toISODate(new Date()),
): string[] {
  return snapshot.phases
    .filter((phase) => phaseIsEstimative(phase) && phaseContainsDate(phase, today))
    .map((phase) => phase.id);
}

export function withConfirmedPhases(
  snapshot: PlanningSnapshot,
  ids: string[],
): PlanningSnapshot {
  const set = new Set(ids);
  if (set.size === 0) return snapshot;
  const phases = snapshot.phases.map((phase) =>
    set.has(phase.id) ? { ...phase, dates_estimatives: false } : phase,
  );
  const next: PlanningSnapshot = { ...snapshot, phases };
  return {
    ...next,
    chantiers: next.chantiers.map((chantier) => ({
      ...chantier,
      dates_estimatives: chantierHasEstimativeDates(next, chantier.id),
    })),
  };
}

export function estimativePhaseIdsForChantier(
  snapshot: PlanningSnapshot,
  chantierId: string,
): string[] {
  const elementIds = new Set(
    snapshot.elements
      .filter((element) => element.chantier_id === chantierId)
      .map((element) => element.id),
  );
  return snapshot.phases
    .filter(
      (phase) => elementIds.has(phase.element_id) && phaseIsEstimative(phase),
    )
    .map((phase) => phase.id);
}

export function phaseIdsToConfirmAfterBonCommande(
  snapshot: PlanningSnapshot,
  chantierId: string,
): string[] {
  const elementIds = new Set(
    snapshot.elements
      .filter((element) => element.chantier_id === chantierId)
      .map((element) => element.id),
  );
  return snapshot.phases
    .filter(
      (phase) =>
        elementIds.has(phase.element_id) &&
        (phase.type_phase === "logistique" ||
          phase.type_phase === "livraison" ||
          phase.type_phase === "pose") &&
        Boolean(phase.date_debut),
    )
    .map((phase) => phase.id);
}

export function chantierIdForPhase(
  snapshot: PlanningSnapshot,
  phaseId: string,
): string | null {
  const phase = snapshot.phases.find((item) => item.id === phaseId);
  if (!phase) return null;
  return (
    snapshot.elements.find((element) => element.id === phase.element_id)
      ?.chantier_id ?? null
  );
}

function runEstimatifSelfCheck() {
  const snapshot: PlanningSnapshot = {
    employees: [],
    chantiers: [
      {
        id: "c1",
        nom_client: "Test",
        adresse: "",
        lien_dossier_onedrive: null,
        priorite: "normal",
        date_creation: "2026-09-01",
        dates_estimatives: true,
      },
    ],
    elements: [{ id: "e1", chantier_id: "c1", nom_element: "Portail" }],
    phases: [
      {
        id: "p1",
        element_id: "e1",
        type_phase: "fabrication",
        duree_estimee_heures: 8,
        date_debut: "2026-09-13",
        date_fin: "2026-09-15",
        employe_id: "emp",
        statut: "a_faire",
        urgent: false,
        dates_estimatives: true,
      },
    ],
    absences: [],
    signalements: [],
    receptions: [],
    demandes: [],
    horaires: [],
  };
  if (!chantierHasEstimativeDates(snapshot, "c1")) {
    throw new Error("dates-estimatives: le chantier doit rester estimatif");
  }
  if (!phaseIdsStartedToday(snapshot, "2026-09-13").includes("p1")) {
    throw new Error("dates-estimatives: aujourd’hui dans la phase → confirmer");
  }
  if (phaseIdsStartedToday(snapshot, "2026-09-12").length) {
    throw new Error("dates-estimatives: avant le début, rester estimatif");
  }
  const confirmed = withConfirmedPhases(snapshot, ["p1"]);
  if (phaseIsEstimative(confirmed.phases[0])) {
    throw new Error("dates-estimatives: la phase confirmée reste estimative");
  }
  if (confirmed.chantiers[0]?.dates_estimatives) {
    throw new Error("dates-estimatives: le chantier doit suivre les phases");
  }
}
runEstimatifSelfCheck();
