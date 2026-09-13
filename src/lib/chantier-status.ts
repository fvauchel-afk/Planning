import { addDays, calendarDaysBetween, formatIsoFr, toISODate } from "@/lib/dates";
import {
  chantierHasEstimativeDates,
} from "@/lib/dates-estimatives";
import type { PhasePatch, PlanningSnapshot, Role, TypePhase } from "@/lib/types";

export const STATUTS_CHANTIER = [
  "non_planifie",
  "a_venir",
  "en_cours",
  "termine",
] as const;
export type StatutChantier = (typeof STATUTS_CHANTIER)[number];

export const STATUT_CHANTIER_LABELS: Record<StatutChantier, string> = {
  non_planifie: "Non planifié",
  a_venir: "À venir",
  en_cours: "En cours",
  termine: "Terminé",
};

export const STATUT_CHANTIER_COLORS: Record<
  StatutChantier,
  { dot: string; tint: string; text: string }
> = {
  non_planifie: { dot: "#a8a29e", tint: "bg-stone-100", text: "text-stone-600" },
  a_venir: { dot: "#2563eb", tint: "bg-blue-50", text: "text-blue-800" },
  en_cours: { dot: "#ea580c", tint: "bg-orange-50", text: "text-orange-800" },
  termine: { dot: "#16a34a", tint: "bg-green-50", text: "text-green-800" },
};

export type ChantierPlanningInfo = {
  statut: StatutChantier;
  firstDate: string | null;
  lastDate: string | null;
  rangeLabel: string | null;
  title: string;
  estimatif: boolean;
};

export function chantierDateRange(
  snapshot: PlanningSnapshot,
  chantierId: string,
): { firstDate: string | null; lastDate: string | null } {
  const elementIds = new Set(
    snapshot.elements
      .filter((element) => element.chantier_id === chantierId)
      .map((element) => element.id),
  );
  let firstDate: string | null = null;
  let lastDate: string | null = null;
  for (const phase of snapshot.phases) {
    if (!elementIds.has(phase.element_id)) continue;
    const start = phase.date_debut?.slice(0, 10) || null;
    const end = phase.date_fin?.slice(0, 10) || start;
    if (start && (!firstDate || start < firstDate)) firstDate = start;
    if (end && (!lastDate || end > lastDate)) lastDate = end;
  }
  return { firstDate, lastDate };
}

export function statutChantierFromRange(
  firstDate: string | null,
  lastDate: string | null,
  today = toISODate(new Date()),
): StatutChantier {
  if (!firstDate || !lastDate) return "non_planifie";
  if (firstDate > today) return "a_venir";
  if (lastDate < today) return "termine";
  return "en_cours";
}

export function chantierPlanningInfo(
  snapshot: PlanningSnapshot,
  chantierId: string,
  today = toISODate(new Date()),
): ChantierPlanningInfo {
  const { firstDate, lastDate } = chantierDateRange(snapshot, chantierId);
  const statut = statutChantierFromRange(firstDate, lastDate, today);
  const rangeLabel =
    firstDate && lastDate
      ? `${formatIsoFr(firstDate)} → ${formatIsoFr(lastDate)}`
      : null;
  const estimatif = chantierHasEstimativeDates(snapshot, chantierId);
  const title = rangeLabel
    ? `${STATUT_CHANTIER_LABELS[statut]} · ${rangeLabel}${estimatif ? " · Estimatif" : ""}`
    : STATUT_CHANTIER_LABELS[statut];
  return { statut, firstDate, lastDate, rangeLabel, title, estimatif };
}

export function shiftChantierPhasePatches(
  snapshot: PlanningSnapshot,
  chantierId: string,
  days: number,
): PhasePatch[] {
  if (!days) return [];
  const elementIds = new Set(
    snapshot.elements
      .filter((element) => element.chantier_id === chantierId)
      .map((element) => element.id),
  );
  const patches: PhasePatch[] = [];
  for (const phase of snapshot.phases) {
    if (!elementIds.has(phase.element_id) || !phase.date_debut) continue;
    const start = phase.date_debut.slice(0, 10);
    const end = (phase.date_fin || phase.date_debut).slice(0, 10);
    patches.push({
      id: phase.id,
      date_debut: addDays(start, days),
      date_fin: addDays(end, days),
      employe_id: phase.employe_id,
      heure_debut: phase.heure_debut ?? null,
    });
  }
  return patches;
}

function runChantierStatusSelfCheck() {
  if (statutChantierFromRange(null, null, "2026-09-11") !== "non_planifie") {
    throw new Error("chantier-status: sans dates → non planifié");
  }
  if (statutChantierFromRange("2026-09-20", "2026-09-22", "2026-09-11") !== "a_venir") {
    throw new Error("chantier-status: début futur → à venir");
  }
  if (statutChantierFromRange("2026-09-01", "2026-09-14", "2026-09-11") !== "en_cours") {
    throw new Error("chantier-status: aujourd’hui dans la plage → en cours");
  }
  if (statutChantierFromRange("2026-09-01", "2026-09-10", "2026-09-11") !== "termine") {
    throw new Error("chantier-status: fin passée → terminé");
  }
  if (calendarDaysBetween("2026-09-10", "2026-09-12") !== 2) {
    throw new Error("chantier-status: décalage calendaire");
  }
}

runChantierStatusSelfCheck();

export function phaseTypeForRoles(roles: Role[]): TypePhase {
  if (roles.includes("pose")) return "pose";
  if (roles.includes("fabrication")) return "fabrication";
  if (roles.includes("administratif")) return "administratif";
  return "logistique";
}

export function employeeCanTakePhase(
  employee: { actif: boolean; roles: Role[] },
  type: TypePhase,
): boolean {
  if (!employee.actif) return false;
  if (type === "logistique") return false;
  if (type === "livraison") return true;
  return employee.roles.includes(type);
}
