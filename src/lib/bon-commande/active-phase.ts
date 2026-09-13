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
  return activePhaseType(snapshot, chantierId) === "fabrication";
}
