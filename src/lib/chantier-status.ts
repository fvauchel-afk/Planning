import { addDays, calendarDaysBetween, formatIsoFr, toISODate } from "@/lib/dates";
import {
  chantierHasEstimativeDates,
} from "@/lib/dates-estimatives";
import { compareEmployeesByOrdre } from "@/lib/display-order";
import {
  LOGISTIQUE_ROW_ID,
  ROLES,
  TRANSPORT_ROW_ID,
  type PhasePatch,
  type PlanningSnapshot,
  type Role,
  type TypePhase,
} from "@/lib/types";

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

/** Jour (date ISO) du dernier créneau planifié du chantier. */
export function isChantierLastPlannedDay(
  snapshot: PlanningSnapshot,
  chantierId: string,
  iso: string,
): boolean {
  const { lastDate } = chantierDateRange(snapshot, chantierId);
  return Boolean(lastDate) && lastDate === iso.slice(0, 10);
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
  const lastDaySnap: PlanningSnapshot = {
    employees: [],
    chantiers: [
      {
        id: "c1",
        nom_client: "Blaevoet Baie",
        adresse: "",
        lien_dossier_onedrive: null,
        priorite: "normal",
        date_creation: "2026-09-01",
      },
    ],
    elements: [{ id: "e1", chantier_id: "c1", nom_element: "Portail" }],
    phases: [
      {
        id: "p1",
        element_id: "e1",
        type_phase: "fabrication",
        duree_estimee_heures: 16,
        date_debut: "2026-09-17",
        date_fin: "2026-09-18",
        employe_id: "jon",
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
  if (isChantierLastPlannedDay(lastDaySnap, "c1", "2026-09-17")) {
    throw new Error("chantier-status: retard seulement le dernier jour");
  }
  if (!isChantierLastPlannedDay(lastDaySnap, "c1", "2026-09-18")) {
    throw new Error("chantier-status: le 18 est le dernier jour planifié");
  }
}

runChantierStatusSelfCheck();

export function phaseTypeForRoles(roles: Role[]): TypePhase {
  const normalized = normalizeEmployeeRoles(roles);
  if (normalized.includes("pose")) return "pose";
  if (normalized.includes("fabrication")) return "fabrication";
  if (normalized.includes("administratif")) return "administratif";
  return "logistique";
}

const ROLE_SET = new Set<string>(ROLES);

export function normalizeEmployeeRoles(roles: unknown): Role[] {
  if (Array.isArray(roles)) {
    return roles.filter((item): item is Role => typeof item === "string" && ROLE_SET.has(item));
  }
  if (typeof roles === "string") {
    return roles
      .replace(/^[{\[]/, "")
      .replace(/[}\]]$/, "")
      .split(",")
      .map((item) => item.trim().replace(/^["']|["']$/g, ""))
      .filter((item): item is Role => ROLE_SET.has(item));
  }
  return [];
}

function isAssignablePerson(employee: { id: string }): boolean {
  return employee.id !== LOGISTIQUE_ROW_ID && employee.id !== TRANSPORT_ROW_ID;
}

export function employeeCanTakePhase(
  employee: { actif: boolean; roles: unknown; id?: string },
  type: TypePhase,
): boolean {
  if (!employee.actif) return false;
  if (employee.id && !isAssignablePerson({ id: employee.id })) return false;
  if (type === "logistique") return false;
  if (type === "livraison") return true;
  return normalizeEmployeeRoles(employee.roles).includes(type as Role);
}

type PhaseSelectEmployee = {
  id: string;
  nom: string;
  actif: boolean;
  roles: unknown;
  ordre_affichage?: number | null;
};

/** Options d’un <select> salarié : jamais une valeur hors liste (message orange du navigateur). */
export function employeesForPhaseSelect<T extends PhaseSelectEmployee>(
  employees: T[],
  type: TypePhase,
  selectedId?: string | null,
): T[] {
  const people = employees.filter(isAssignablePerson);
  const eligible = people
    .filter((employee) => employeeCanTakePhase(employee, type))
    .sort(compareEmployeesByOrdre);
  const selected = (selectedId ?? "").trim();
  if (selected) {
    const extra = people.find((employee) => employee.id === selected);
    if (extra && !eligible.some((employee) => employee.id === extra.id)) {
      eligible.push(extra);
    }
  }
  if (eligible.length === 0) {
    return people.filter((employee) => employee.actif).sort(compareEmployeesByOrdre);
  }
  return eligible;
}

export function coerceSelectValue(
  value: string,
  options: Array<{ id: string }>,
): string {
  if (!value) return "";
  return options.some((item) => item.id === value) ? value : "";
}

function runEmployeePhaseSelectSelfCheck() {
  const fabricant = {
    id: "emp-fab",
    nom: "Romain",
    actif: true,
    roles: ["fabrication", "pose"] as Role[],
  };
  const admin = {
    id: "emp-admin",
    nom: "Jonathan",
    actif: true,
    roles: ["administratif"] as Role[],
  };
  const pgArray = {
    id: "emp-pg",
    nom: "Alexis",
    actif: true,
    roles: "{fabrication,pose}",
  };
  if (!employeeCanTakePhase(pgArray, "fabrication")) {
    throw new Error("chantier-status: rôles Postgres texte doivent compter pour fabrication");
  }
  const listed = employeesForPhaseSelect([admin, fabricant], "fabrication", "");
  if (listed.length !== 1 || listed[0]?.id !== "emp-fab") {
    throw new Error("chantier-status: le select fabrication doit lister le fabricant");
  }
  const unmatched = employeesForPhaseSelect([admin, fabricant], "fabrication", "emp-admin");
  if (!unmatched.some((item) => item.id === "emp-admin")) {
    throw new Error("chantier-status: le salarié déjà choisi reste dans la liste");
  }
  const fallback = employeesForPhaseSelect([admin], "fabrication", "");
  if (fallback.length !== 1 || fallback[0]?.id !== "emp-admin") {
    throw new Error("chantier-status: sans fabricant, proposer les salariés actifs");
  }
  if (coerceSelectValue("manquant", listed) !== "") {
    throw new Error("chantier-status: valeur absente des options → vide");
  }
}

runEmployeePhaseSelectSelfCheck();
