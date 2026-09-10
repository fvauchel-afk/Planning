import { addDays, startOfWeekIso } from "@/lib/dates";
import type { PlanningSnapshot } from "@/lib/types";
import { capacityHoursForWeek } from "./hours";
import { TARGET_LOAD, buildOccupancy, occupancySpans } from "./slots";

export type WeekLoad = {
  weekStart: string;
  plannedHours: number;
  capacityHours: number;
  rate: number;
  tone: "green" | "orange" | "red";
};

export type UnplacedElement = {
  chantier: string;
  element: string;
  reasons: string[];
};

export type Synthesis = {
  weeks: WeekLoad[];
  unplaced: UnplacedElement[];
  target: number;
};

export function buildSynthesis(
  snapshot: PlanningSnapshot,
  weekCount = 12,
  fromIso?: string,
): Synthesis {
  const occupancy = buildOccupancy(snapshot);
  const start = startOfWeekIso(fromIso ?? new Date().toISOString().slice(0, 10));
  const weeks: WeekLoad[] = [];

  for (let w = 0; w < weekCount; w += 1) {
    const weekStart = addDays(start, w * 7);
    const weekEnd = addDays(weekStart, 6);
    let plannedHours = 0;
    for (const span of occupancySpans(occupancy)) {
      if (span.rowId === "logistique-sous-traitance") continue;
      if (span.date < weekStart || span.date > weekEnd) continue;
      plannedHours += (span.end - span.start) / 60;
    }
    plannedHours = Math.round(plannedHours * 10) / 10;
    const capacityHours = capacityHoursForWeek(snapshot, weekStart);
    const rate = capacityHours === 0 ? 0 : plannedHours / capacityHours;
    const tone = rate <= TARGET_LOAD ? "green" : rate <= 1 ? "orange" : "red";
    weeks.push({ weekStart, plannedHours, capacityHours, rate, tone });
  }

  const unplaced: UnplacedElement[] = [];
  for (const element of snapshot.elements) {
    const chantier = snapshot.chantiers.find((item) => item.id === element.chantier_id);
    const phases = snapshot.phases.filter((phase) => phase.element_id === element.id);
    const reasons: string[] = [];
    for (const phase of phases) {
      if (phase.duree_estimee_heures > 0 && (!phase.date_debut || !phase.date_fin)) {
        reasons.push(`${phase.type_phase} non planifié (${phase.duree_estimee_heures} h)`);
      }
    }
    if (reasons.length > 0) {
      unplaced.push({
        chantier: chantier?.nom_client ?? "Chantier",
        element: element.nom_element,
        reasons,
      });
    }
  }

  return { weeks, unplaced, target: TARGET_LOAD };
}

export { TARGET_LOAD };
export { HOURS_PER_SLOT } from "./slots";
