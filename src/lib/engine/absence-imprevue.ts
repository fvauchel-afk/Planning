import { addDays, datesOverlap, startOfWeekIso } from "@/lib/dates";
import { hoursTakenOnHalf } from "@/lib/absence-creneau";
import {
  planAbsenceCascade,
  type DelayPlanResult,
} from "@/lib/engine/delay";
import { contractHoursForSlot } from "@/lib/engine/hours";
import {
  buildOccupancy,
  isEmployeeAbsent,
  isSlotBlockedForRow,
  occupySlots,
  occupancySpans,
  slotsFromExistingPhase,
  type OccupiedSlot,
} from "@/lib/engine/slots";
import { employeeCanTakePhase } from "@/lib/chantier-status";
import type {
  Employee,
  NewAbsenceInput,
  PhasePatch,
  PhasePlanning,
  PlanningSnapshot,
} from "@/lib/types";

export type AbsenceResolution = "delay" | "reassign";

export type AbsencePhaseChoice = {
  action: AbsenceResolution;
  employeeId?: string;
};

export type ImpactedPhaseView = {
  phase: PhasePlanning;
  nom_client: string;
  nom_element: string;
};

export function phaseOverlapsAbsencePeriod(
  snapshot: PlanningSnapshot,
  phase: PhasePlanning,
  from: string,
  to: string,
  absence?: {
    creneau?: NewAbsenceInput["creneau"];
    duree_heures?: number | null;
    type?: NewAbsenceInput["type"];
  },
): boolean {
  if (!phase.date_debut || !phase.date_fin) return false;
  if (phase.statut === "termine") return false;
  if (!datesOverlap(phase.date_debut, phase.date_fin, from, to)) return false;
  const employeeId = phase.employe_id;
  if (!employeeId) return false;
  return slotsFromExistingPhase(snapshot, phase).some((slot) => {
    if (slot.date < from || slot.date > to) return false;
    const morning = contractHoursForSlot(snapshot, employeeId, slot.date, 0);
    const afternoon = contractHoursForSlot(snapshot, employeeId, slot.date, 1);
    return (
      hoursTakenOnHalf(
        [
          {
            date_debut: from,
            date_fin: to,
            creneau: absence?.creneau ?? "journee",
            duree_heures: absence?.duree_heures ?? null,
            type: absence?.type ?? "conge",
          },
        ],
        slot.date,
        slot.half,
        morning,
        afternoon,
      ) > 0.0001
    );
  });
}

export function listImpactedPhases(
  snapshot: PlanningSnapshot,
  employeeId: string,
  from: string,
  to: string,
  absence?: {
    creneau?: NewAbsenceInput["creneau"];
    duree_heures?: number | null;
    type?: NewAbsenceInput["type"];
  },
): ImpactedPhaseView[] {
  const rows: ImpactedPhaseView[] = [];
  for (const phase of snapshot.phases) {
    if (phase.employe_id !== employeeId) continue;
    if (!phaseOverlapsAbsencePeriod(snapshot, phase, from, to, absence)) continue;
    const element = snapshot.elements.find((item) => item.id === phase.element_id);
    const chantier = snapshot.chantiers.find(
      (item) => item.id === element?.chantier_id,
    );
    rows.push({
      phase,
      nom_client: chantier?.nom_client ?? "Chantier",
      nom_element: element?.nom_element ?? "Élément",
    });
  }
  rows.sort((a, b) => {
    const start = (a.phase.date_debut ?? "").localeCompare(b.phase.date_debut ?? "");
    if (start !== 0) return start;
    return a.phase.id.localeCompare(b.phase.id);
  });
  return rows;
}

function weekLoad(
  occupancy: Map<string, string>,
  employeeId: string,
  weekStart: string,
): number {
  const last = addDays(weekStart, 6);
  let count = 0;
  for (const span of occupancySpans(occupancy)) {
    if (span.rowId !== employeeId) continue;
    if (span.date < weekStart || span.date > last) continue;
    count += 1;
  }
  return count;
}

function slotsFreeForEmployee(
  snapshot: PlanningSnapshot,
  occupancy: Map<string, string>,
  employeeId: string,
  slots: OccupiedSlot[],
): boolean {
  const busy = occupancySpans(occupancy).filter((span) => span.rowId === employeeId);
  for (const slot of slots) {
    if (isSlotBlockedForRow(snapshot, employeeId, slot.date, slot.half)) {
      return false;
    }
    if (isEmployeeAbsent(snapshot, employeeId, slot.date, slot.half)) return false;
    const start = slot.startMin;
    const end = slot.endMin;
    if (start != null && end != null) {
      const overlap = busy.some(
        (span) =>
          span.date === slot.date && span.start < end && span.end > start,
      );
      if (overlap) return false;
      continue;
    }
    const taken = busy.some((span) => span.date === slot.date);
    if (taken) return false;
  }
  return true;
}

export function listReassignmentCandidates(
  snapshot: PlanningSnapshot,
  phase: PhasePlanning,
  absentEmployeeId: string,
  reserved: OccupiedSlot[],
): Employee[] {
  const occupancy = buildOccupancy(snapshot, new Set([phase.id]));
  occupySlots(occupancy, reserved, "reserved");
  const needed = slotsFromExistingPhase(snapshot, phase);
  const weekStart = startOfWeekIso(
    phase.date_debut ?? snapshot.chantiers[0]?.date_creation ?? "",
  );
  const candidates = snapshot.employees.filter((employee) => {
    if (employee.id === absentEmployeeId) return false;
    if (phase.type_phase === "logistique") return false;
    if (!employeeCanTakePhase(employee, phase.type_phase)) return false;
    const mapped = needed.map((slot) => ({
      ...slot,
      rowId: employee.id,
    }));
    return slotsFreeForEmployee(snapshot, occupancy, employee.id, mapped);
  });
  candidates.sort((a, b) => {
    const loadA = weekLoad(occupancy, a.id, weekStart);
    const loadB = weekLoad(occupancy, b.id, weekStart);
    if (loadA !== loadB) return loadA - loadB;
    return a.nom.localeCompare(b.nom, "fr");
  });
  return candidates;
}

export function candidatesForChoices(
  snapshot: PlanningSnapshot,
  impacted: ImpactedPhaseView[],
  choices: Record<string, AbsencePhaseChoice>,
): Record<string, Employee[]> {
  const reserved: OccupiedSlot[] = [];
  const out: Record<string, Employee[]> = {};
  for (const row of impacted) {
    const list = listReassignmentCandidates(
      snapshot,
      row.phase,
      row.phase.employe_id ?? "",
      reserved,
    );
    out[row.phase.id] = list;
    const choice = choices[row.phase.id];
    const selectedId =
      choice?.action === "reassign"
        ? choice.employeeId && list.some((item) => item.id === choice.employeeId)
          ? choice.employeeId
          : list[0]?.id
        : undefined;
    if (selectedId) {
      const slots = slotsFromExistingPhase(snapshot, row.phase);
      for (const slot of slots) {
        reserved.push({
          rowId: selectedId,
          date: slot.date,
          half: slot.half,
        });
      }
    }
  }
  return out;
}

function applyPatchesLocally(
  snapshot: PlanningSnapshot,
  patches: PhasePatch[],
): PlanningSnapshot {
  const byId = new Map(patches.map((patch) => [patch.id, patch]));
  return {
    ...snapshot,
    phases: snapshot.phases.map((phase) => {
      const patch = byId.get(phase.id);
      if (!patch) return phase;
      return {
        ...phase,
        date_debut: patch.date_debut,
        date_fin: patch.date_fin,
        employe_id: patch.employe_id,
      };
    }),
  };
}

export function defaultAbsenceChoices(
  snapshot: PlanningSnapshot,
  impacted: ImpactedPhaseView[],
  current: Record<string, AbsencePhaseChoice>,
): Record<string, AbsencePhaseChoice> {
  const lists = candidatesForChoices(snapshot, impacted, current);
  const next: Record<string, AbsencePhaseChoice> = {};
  for (const row of impacted) {
    const list = lists[row.phase.id] ?? [];
    const previous = current[row.phase.id];
    if (list.length === 0) {
      next[row.phase.id] = { action: "delay" };
      continue;
    }
    const stillValid =
      previous?.action === "reassign" &&
      previous.employeeId &&
      list.some((item) => item.id === previous.employeeId);
    if (previous?.action === "delay") {
      next[row.phase.id] = { action: "delay" };
    } else if (stillValid) {
      next[row.phase.id] = previous;
    } else {
      next[row.phase.id] = { action: "reassign", employeeId: list[0]!.id };
    }
  }
  return next;
}

export function planAbsenceImprevue(
  snapshot: PlanningSnapshot,
  absence: NewAbsenceInput,
  choices: Record<string, AbsencePhaseChoice>,
  options?: { ignoreAbsenceId?: string },
): DelayPlanResult {
  const workingSnapshot = options?.ignoreAbsenceId
    ? {
        ...snapshot,
        absences: snapshot.absences.filter(
          (item) => item.id !== options.ignoreAbsenceId,
        ),
      }
    : snapshot;
  const impacted = listImpactedPhases(
    workingSnapshot,
    absence.employe_id,
    absence.date_debut,
    absence.date_fin,
    absence,
  );
  const candidates = candidatesForChoices(workingSnapshot, impacted, choices);
  const patches: PhasePatch[] = [];
  let working = workingSnapshot;

  for (const row of impacted) {
    const choice = choices[row.phase.id];
    if (choice?.action !== "reassign") continue;
    const list = candidates[row.phase.id] ?? [];
    const target =
      list.find((item) => item.id === choice.employeeId) ?? list[0];
    if (!target) continue;
    const patch: PhasePatch = {
      id: row.phase.id,
      date_debut: row.phase.date_debut,
      date_fin: row.phase.date_fin,
      employe_id: target.id,
    };
    patches.push(patch);
    working = applyPatchesLocally(working, [patch]);
  }

  const delayIds = impacted
    .filter((row) => choices[row.phase.id]?.action !== "reassign")
    .map((row) => row.phase.id);

  let conflict = false;
  const displacements: DelayPlanResult["displacements"] = [];
  const messages: string[] = [];

  if (delayIds.length > 0) {
    const originId = delayIds[0];
    const result = planAbsenceCascade(working, originId, absence, {
      ignoreAbsenceId: options?.ignoreAbsenceId,
    });
    patches.push(...result.patches);
    displacements.push(...result.displacements);
    conflict = result.status === "conflict";
    messages.push(result.message);
  }

  const merged = new Map<string, PhasePatch>();
  for (const patch of patches) merged.set(patch.id, patch);

  return {
    status: conflict ? "conflict" : "ok",
    patches: Array.from(merged.values()),
    displacements,
    message: messages[0] ?? `${merged.size} phase(s) mise(s) à jour.`,
  };
}

function runAbsenceOverlapSelfCheck() {
  const snapshot: PlanningSnapshot = {
    employees: [
      {
        id: "alexis",
        nom: "Alexis",
        roles: ["fabrication", "pose"],
        actif: true,
      },
    ],
    chantiers: [
      {
        id: "dupont",
        nom_client: "Portail Dupont",
        adresse: "",
        lien_dossier_onedrive: null,
        priorite: "normal",
        date_creation: "2026-09-01",
      },
    ],
    elements: [{ id: "el-dupont", chantier_id: "dupont", nom_element: "Portail" }],
    phases: [
      {
        id: "fab-dupont",
        element_id: "el-dupont",
        type_phase: "fabrication",
        duree_estimee_heures: 16,
        date_debut: "2026-09-17",
        date_fin: "2026-09-18",
        heure_debut: "07:30",
        employe_id: "alexis",
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
  const hit = listImpactedPhases(snapshot, "alexis", "2026-09-17", "2026-09-18");
  if (hit.length !== 1 || hit[0]?.nom_client !== "Portail Dupont") {
    throw new Error(
      `absence-imprevue: chevauchement 17-18/09 attendu, reçu ${hit.length}`,
    );
  }
  const miss = listImpactedPhases(snapshot, "alexis", "2026-09-19", "2026-09-20");
  if (miss.length !== 0) {
    throw new Error("absence-imprevue: hors période, aucun chantier");
  }
  const plan = planAbsenceImprevue(
    snapshot,
    {
      employe_id: "alexis",
      date_debut: "2026-09-17",
      date_fin: "2026-09-18",
      type: "conge",
    },
    { "fab-dupont": { action: "delay" } },
  );
  const moved = plan.patches.find((patch) => patch.id === "fab-dupont");
  if (!moved?.date_debut || moved.date_debut <= "2026-09-18") {
    throw new Error(
      `absence-imprevue: décalage attendu après le 18/09, reçu ${moved?.date_debut ?? "aucun patch"}`,
    );
  }
  if (plan.status === "conflict") {
    throw new Error("absence-imprevue: un chantier normal ne doit pas exiger l’arbitrage");
  }
  const prioPlan = planAbsenceImprevue(
    {
      ...snapshot,
      chantiers: snapshot.chantiers.map((item) => ({
        ...item,
        priorite: "prioritaire",
      })),
    },
    {
      employe_id: "alexis",
      date_debut: "2026-09-17",
      date_fin: "2026-09-18",
      type: "conge",
    },
    { "fab-dupont": { action: "delay" } },
  );
  if (prioPlan.status !== "conflict") {
    throw new Error(
      "absence-imprevue: décaler un chantier prioritaire doit ouvrir le conflit de placement",
    );
  }
}

runAbsenceOverlapSelfCheck();

