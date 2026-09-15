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
    .filter(
      (phase) =>
        phase.type_phase !== "fabrication" &&
        phaseIsEstimative(phase) &&
        phaseContainsDate(phase, today),
    )
    .map((phase) => phase.id);
}

export function withConfirmedPhases(
  snapshot: PlanningSnapshot,
  ids: string[],
): PlanningSnapshot {
  const set = new Set(ids);
  if (set.size === 0) return snapshot;
  const phases = snapshot.phases.map((phase) =>
    set.has(phase.id)
      ? { ...phase, dates_estimatives: false, lancement_valide: true }
      : phase,
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
  if (phaseIdsStartedToday(snapshot, "2026-09-13").includes("p1")) {
    throw new Error(
      "dates-estimatives: la fabrication ne doit plus se confirmer toute seule",
    );
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
  if (!fabricationAwaitingLaunch(snapshot.phases[0]!, "2026-09-13")) {
    throw new Error("dates-estimatives: fabrication estimative commencée à alerter");
  }
  if (fabricationAwaitingLaunch(snapshot.phases[0]!, "2026-09-12")) {
    throw new Error("dates-estimatives: avant le début, pas d’alerte lancement");
  }
  if (fabricationAwaitingLaunch(confirmed.phases[0]!, "2026-09-13")) {
    throw new Error("dates-estimatives: après Je valide, plus d’alerte");
  }
  const alreadySilent = {
    ...snapshot.phases[0]!,
    dates_estimatives: false,
    lancement_valide: false,
  };
  if (!fabricationAwaitingLaunch(alreadySilent, "2026-09-13")) {
    throw new Error(
      "dates-estimatives: même sans Estimatif, alerter si le clic n’a pas eu lieu",
    );
  }
  if (lancementsEnAttente(snapshot, "2026-09-14")[0]?.nomClient !== "Test") {
    throw new Error("dates-estimatives: l’alerte doit citer le chantier");
  }
  const silentSnap: PlanningSnapshot = {
    ...snapshot,
    phases: [alreadySilent],
    chantiers: [{ ...snapshot.chantiers[0]!, dates_estimatives: false }],
  };
  if (fabricationPhaseIdsAwaitingLaunch(silentSnap, "c1", "2026-09-13")[0] !== "p1") {
    throw new Error("dates-estimatives: Confirmé sans clic doit encore proposer le lancement");
  }
  if (fabricationPhaseIdsAwaitingLaunch(confirmed, "c1", "2026-09-13").length) {
    throw new Error("dates-estimatives: après Je valide, plus d’id à valider");
  }
}

export function fabricationAwaitingLaunch(
  phase: PhasePlanning,
  today = toISODate(new Date()),
): boolean {
  if (phase.type_phase !== "fabrication") return false;
  if (phase.statut === "termine") return false;
  if (phase.lancement_valide) return false;
  const start = phase.date_debut?.slice(0, 10);
  if (!start) return false;
  return start <= today;
}

export function fabricationPhaseIdsAwaitingLaunch(
  snapshot: PlanningSnapshot,
  chantierId: string,
  today = toISODate(new Date()),
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
        fabricationAwaitingLaunch(phase, today),
    )
    .map((phase) => phase.id);
}

export type LancementEnAttente = {
  chantierId: string;
  nomClient: string;
  phaseId: string;
  dateDebut: string;
};

export function lancementsEnAttente(
  snapshot: PlanningSnapshot,
  today = toISODate(new Date()),
): LancementEnAttente[] {
  const elementById = new Map(
    snapshot.elements.map((element) => [element.id, element]),
  );
  const chantierById = new Map(
    snapshot.chantiers.map((chantier) => [chantier.id, chantier]),
  );
  const rows: LancementEnAttente[] = [];
  const seen = new Set<string>();
  for (const phase of snapshot.phases) {
    if (!fabricationAwaitingLaunch(phase, today)) continue;
    const element = elementById.get(phase.element_id);
    if (!element) continue;
    const chantier = chantierById.get(element.chantier_id);
    if (!chantier || seen.has(chantier.id)) continue;
    seen.add(chantier.id);
    rows.push({
      chantierId: chantier.id,
      nomClient: chantier.nom_client,
      phaseId: phase.id,
      dateDebut: phase.date_debut!.slice(0, 10),
    });
  }
  rows.sort((a, b) => a.dateDebut.localeCompare(b.dateDebut) || a.nomClient.localeCompare(b.nomClient, "fr"));
  return rows;
}
runEstimatifSelfCheck();
