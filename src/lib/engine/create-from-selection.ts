import { formatDisplayedDay } from "@/lib/dates";
import {
  hoursForSlot,
  timeFromMinutes,
  workWindowsForRow,
} from "@/lib/engine/hours";
import { normalizeEmployeeRoles } from "@/lib/chantier-status";
import {
  LOGISTIQUE_ROW_ID,
  PHASE_LABELS,
  TRANSPORT_ROW_ID,
  TYPES_PHASE,
  type Employee,
  type NewElementInput,
  type NewChantierInput,
  type PlanningSnapshot,
  type TypePhase,
} from "@/lib/types";

export type EmptyCellPick = {
  rowId: string;
  date: string;
  half: 0 | 1;
};

export type SelectionPhasePlan = {
  type_phase: TypePhase;
  employe_id: string;
  employe_nom: string;
  date_debut: string;
  date_fin: string;
  heure_debut: string;
  duree_estimee_heures: number;
  cells: EmptyCellPick[];
};

export function emptyCellKey(pick: EmptyCellPick): string {
  return `${pick.rowId}|${pick.date}|${pick.half}`;
}

export function halfLabelFr(half: 0 | 1): string {
  return half === 0 ? "matin" : "après-midi";
}

/** Fabricant → Fabrication, poseur → Pose. Les lignes logistique / transport sont ignorées. */
export function phaseTypeForPlanningRow(
  employee: Employee | null | undefined,
): TypePhase | null {
  if (!employee?.actif) return null;
  const roles = normalizeEmployeeRoles(employee.roles);
  if (roles.includes("pose") && !roles.includes("fabrication")) return "pose";
  if (roles.includes("fabrication") && !roles.includes("pose")) {
    return "fabrication";
  }
  if (roles.includes("pose")) return "pose";
  if (roles.includes("fabrication")) return "fabrication";
  return null;
}

function sortPicks(picks: EmptyCellPick[]): EmptyCellPick[] {
  return [...picks].sort((left, right) => {
    if (left.date !== right.date) return left.date.localeCompare(right.date);
    if (left.half !== right.half) return left.half - right.half;
    return left.rowId.localeCompare(right.rowId);
  });
}

function heureDebutForPick(
  snapshot: PlanningSnapshot,
  pick: EmptyCellPick,
): string {
  const windows = workWindowsForRow(snapshot, pick.rowId, pick.date);
  const window = windows.find((item) => item.half === pick.half);
  if (window) return timeFromMinutes(window.start);
  return pick.half === 0 ? "07:30" : "13:00";
}

export function plansFromEmptyPicks(
  snapshot: PlanningSnapshot,
  picks: EmptyCellPick[],
): { plans: SelectionPhasePlan[]; error: string | null } {
  const unique = new Map<string, EmptyCellPick>();
  for (const pick of picks) {
    unique.set(emptyCellKey(pick), pick);
  }
  const sorted = sortPicks(Array.from(unique.values()));
  if (sorted.length === 0) {
    return { plans: [], error: "Choisissez au moins une case vide." };
  }

  const byEmployee = new Map<string, EmptyCellPick[]>();
  for (const pick of sorted) {
    if (pick.rowId === LOGISTIQUE_ROW_ID || pick.rowId === TRANSPORT_ROW_ID) {
      return {
        plans: [],
        error:
          "Créez le chantier sur une ligne de fabricant ou de poseur, pas sur Thermolaquage ou le véhicule.",
      };
    }
    const employee = snapshot.employees.find((item) => item.id === pick.rowId);
    const type = phaseTypeForPlanningRow(employee ?? null);
    if (!employee || !type) {
      return {
        plans: [],
        error:
          "Chaque case doit être sur un fabricant (Fabrication) ou un poseur (Pose).",
      };
    }
    const hours = hoursForSlot(snapshot, pick.rowId, pick.date, pick.half);
    if (hours <= 0) {
      return {
        plans: [],
        error: `Pas d’horaire ce ${halfLabelFr(pick.half)}-là pour ${employee.nom}.`,
      };
    }
    const list = byEmployee.get(employee.id) ?? [];
    list.push(pick);
    byEmployee.set(employee.id, list);
  }

  const plans: SelectionPhasePlan[] = [];
  let fabricants = 0;
  for (const [employeeId, cells] of Array.from(byEmployee.entries())) {
    const employee = snapshot.employees.find((item) => item.id === employeeId);
    if (!employee) continue;
    const type = phaseTypeForPlanningRow(employee);
    if (!type) continue;
    if (type === "fabrication") fabricants += 1;
    const first = cells[0]!;
    const last = cells[cells.length - 1]!;
    const hours = cells.reduce(
      (total, cell) =>
        total + hoursForSlot(snapshot, cell.rowId, cell.date, cell.half),
      0,
    );
    plans.push({
      type_phase: type,
      employe_id: employee.id,
      employe_nom: employee.nom,
      date_debut: first.date,
      date_fin: last.date,
      heure_debut: heureDebutForPick(snapshot, first),
      duree_estimee_heures: Math.round(hours * 100) / 100,
      cells,
    });
  }

  if (fabricants > 1) {
    return {
      plans: [],
      error:
        "Un seul fabricant par élément : laissez une seule ligne Fabrication dans la sélection (plusieurs poseurs, oui).",
    };
  }
  if (plans.length === 0) {
    return { plans: [], error: "Choisissez au moins une case vide." };
  }
  return { plans, error: null };
}

export function recapSelectionPlans(plans: SelectionPhasePlan[]): string[] {
  return plans.map((plan) => {
    const slots = plan.cells
      .map(
        (cell) =>
          `${formatDisplayedDay(cell.date)} ${halfLabelFr(cell.half)}`,
      )
      .join(", ");
    return `${PHASE_LABELS[plan.type_phase]} · ${plan.employe_nom} · ${plan.duree_estimee_heures} h (${slots})`;
  });
}

export function buildChantierFromSelectionPlans(
  nomClient: string,
  plans: SelectionPhasePlan[],
  hoursByPlan: Record<string, number>,
): NewChantierInput | { error: string } {
  const client = nomClient.trim();
  if (!client) return { error: "Le nom du client est obligatoire." };
  if (plans.length === 0) {
    return { error: "Choisissez au moins une case vide." };
  }

  const resolved = plans.map((plan, index) => {
    const override = hoursByPlan[planKey(plan, index)];
    const hours =
      override != null && Number.isFinite(override) && override > 0
        ? Math.round(override * 100) / 100
        : plan.duree_estimee_heures;
    return { ...plan, duree_estimee_heures: hours };
  });

  const hasFab = resolved.some((plan) => plan.type_phase === "fabrication");
  const posePlans = resolved.filter((plan) => plan.type_phase === "pose");
  const fabPlan = resolved.find((plan) => plan.type_phase === "fabrication");

  const starts = resolved.map((plan) => plan.date_debut).sort();
  const ends = resolved.map((plan) => plan.date_fin).sort();

  const emptyPhase = (type: TypePhase): NewElementInput["phases"][number] => ({
    type_phase: type,
    duree_estimee_heures: 0,
    date_debut: null,
    date_fin: null,
    employe_id: null,
    urgent: false,
    heures_supplementaires_par_jour: 0,
  });

  const fromPlan = (
    type: TypePhase,
    plan: SelectionPhasePlan,
  ): NewElementInput["phases"][number] => ({
    type_phase: type,
    duree_estimee_heures: plan.duree_estimee_heures,
    date_debut: plan.date_debut,
    date_fin: plan.date_fin,
    heure_debut: plan.heure_debut,
    employe_id: plan.employe_id,
    urgent: false,
    heures_supplementaires_par_jour: 0,
    dates_estimatives: false,
  });

  const phases: NewElementInput["phases"] = [];
  for (const type of TYPES_PHASE) {
    if (type === "fabrication" && fabPlan) {
      phases.push(fromPlan(type, fabPlan));
      continue;
    }
    if (type === "pose" && posePlans.length > 0) {
      for (const plan of posePlans) phases.push(fromPlan(type, plan));
      continue;
    }
    phases.push(emptyPhase(type));
  }

  return {
    nom_client: client,
    adresse: "",
    lien_dossier_onedrive: null,
    priorite: "normal",
    date_debut: starts[0] ?? null,
    date_fin: ends[ends.length - 1] ?? null,
    dates_estimatives: false,
    avec_fabrication: hasFab,
    avec_pose: posePlans.length > 0,
    avec_thermolaquage: false,
    avec_livraison: false,
    elements: [{ nom_element: client, phases }],
  };
}

export function planKey(plan: SelectionPhasePlan, index: number): string {
  return `${plan.type_phase}:${plan.employe_id}:${index}`;
}

function runCreateFromSelectionSelfCheck() {
  const fab: Employee = {
    id: "fab-1",
    nom: "Romain",
    roles: ["fabrication"],
    actif: true,
  };
  const poseA: Employee = {
    id: "pose-a",
    nom: "Raphaël",
    roles: ["pose"],
    actif: true,
  };
  const poseB: Employee = {
    id: "pose-b",
    nom: "Léo",
    roles: ["pose"],
    actif: true,
  };
  if (phaseTypeForPlanningRow(fab) !== "fabrication") {
    throw new Error("create-from-selection: fabricant → Fabrication");
  }
  if (phaseTypeForPlanningRow(poseA) !== "pose") {
    throw new Error("create-from-selection: poseur → Pose");
  }
  const mixed: Employee = {
    id: "mix",
    nom: "Mixte",
    roles: ["fabrication", "pose"],
    actif: true,
  };
  if (phaseTypeForPlanningRow(mixed) !== "pose") {
    throw new Error("create-from-selection: pose + fab → Pose (ligne poseur)");
  }

  const snapshot: PlanningSnapshot = {
    employees: [fab, poseA, poseB],
    chantiers: [],
    elements: [],
    phases: [],
    absences: [],
    signalements: [],
    receptions: [],
    demandes: [],
    horaires: [],
  };
  const twoPoseurs = plansFromEmptyPicks(snapshot, [
    { rowId: "pose-a", date: "2026-09-21", half: 0 },
    { rowId: "pose-b", date: "2026-09-21", half: 0 },
  ]);
  if (twoPoseurs.error) {
    throw new Error(`create-from-selection: ${twoPoseurs.error}`);
  }
  if (twoPoseurs.plans.filter((plan) => plan.type_phase === "pose").length !== 2) {
    throw new Error("create-from-selection: deux poseurs = deux lignes Pose");
  }
  const twoFabs = plansFromEmptyPicks(snapshot, [
    { rowId: "fab-1", date: "2026-09-21", half: 0 },
    { rowId: "fab-1", date: "2026-09-21", half: 1 },
  ]);
  if (twoFabs.error) {
    throw new Error(`create-from-selection fab: ${twoFabs.error}`);
  }
  const input = buildChantierFromSelectionPlans("Martin", twoPoseurs.plans, {});
  if ("error" in input) throw new Error(input.error);
  if (!input.avec_pose || input.avec_fabrication) {
    throw new Error("create-from-selection: pose seule, pas de fabrication");
  }
  const poseCount = input.elements[0]!.phases.filter(
    (phase) => phase.type_phase === "pose",
  ).length;
  if (poseCount !== 2) {
    throw new Error("create-from-selection: garder les deux poseurs");
  }
}
runCreateFromSelectionSelfCheck();
