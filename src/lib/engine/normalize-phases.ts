import type { ElementChantier, PhasePlanning } from "@/lib/types";

/** Aligne les phases héritées (import SQL, champs manquants) sur le modèle actuel. */
export function normalizePhasesForPlanning(
  phases: PhasePlanning[],
  elements: ElementChantier[],
): PhasePlanning[] {
  const chantierByElement = new Map(
    elements.map((element) => [element.id, element.chantier_id]),
  );
  const employeeByChantier = new Map<string, string>();
  for (const phase of phases) {
    if (!phase.employe_id) continue;
    const chantierId = chantierByElement.get(phase.element_id);
    if (!chantierId || employeeByChantier.has(chantierId)) continue;
    employeeByChantier.set(chantierId, phase.employe_id);
  }

  return phases.map((phase) => {
    const dateDebut = phase.date_debut?.slice(0, 10) || null;
    let dateFin = phase.date_fin?.slice(0, 10) || null;
    if (dateDebut && !dateFin) dateFin = dateDebut;
    let heure =
      typeof phase.heure_debut === "string" && phase.heure_debut.trim()
        ? phase.heure_debut.trim().slice(0, 5)
        : null;
    let duree = Number(phase.duree_estimee_heures) || 0;
    if (dateDebut && !heure) {
      heure = duree > 0 && duree <= 3.5 ? "13:00" : "07:30";
    }
    if (dateDebut && duree <= 0) {
      duree = heure && heure >= "12:00" ? 3 : 4;
    }
    let employeId = phase.employe_id;
    const chantierId = chantierByElement.get(phase.element_id);
    if (
      dateDebut &&
      phase.type_phase !== "logistique" &&
      !employeId &&
      chantierId
    ) {
      employeId = employeeByChantier.get(chantierId) ?? null;
    }
    return {
      ...phase,
      date_debut: dateDebut,
      date_fin: dateFin,
      heure_debut: heure,
      duree_estimee_heures: duree,
      employe_id: employeId,
    };
  });
}
