import { addDays, datesOverlap, startOfWeekIso } from "@/lib/dates";
import {
  planAbsenceCascade,
  type DelayPlanResult,
} from "@/lib/engine/delay";
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
): boolean {
  if (!phase.date_debut || !phase.date_fin) return false;
  if (phase.statut === "termine") return false;
  if (!datesOverlap(phase.date_debut, phase.date_fin, from, to)) return false;
  return slotsFromExistingPhase(snapshot, phase).some(
    (slot) => slot.date >= from && slot.date <= to,
  );
}

export function listImpactedPhases(
  snapshot: PlanningSnapshot,
  employeeId: string,
  from: string,
  to: string,
): ImpactedPhaseView[] {
  const rows: ImpactedPhaseView[] = [];
  for (const phase of snapshot.phases) {
    if (phase.employe_id !== employeeId) continue;
    if (!phaseOverlapsAbsencePeriod(snapshot, phase, from, to)) continue;
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
    if (isEmployeeAbsent(snapshot, employeeId, slot.date)) return false;
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

export function planAbsenceImprevue(
  snapshot: PlanningSnapshot,
  absence: NewAbsenceInput,
  choices: Record<string, AbsencePhaseChoice>,
): DelayPlanResult {
  const impacted = listImpactedPhases(
    snapshot,
    absence.employe_id,
    absence.date_debut,
    absence.date_fin,
  );
  const candidates = candidatesForChoices(snapshot, impacted, choices);
  const patches: PhasePatch[] = [];
  let working = snapshot;

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
    const result = planAbsenceCascade(working, originId, absence);
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
