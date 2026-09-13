import { addDays, addWorkingDays, formatLongDate, formatOvertimeHours, startOfWeekIso } from "@/lib/dates";
import { employeeCanTakePhase } from "@/lib/chantier-status";
import {
  LOGISTIQUE_ROW_ID,
  PHASE_LABELS,
  type NewChantierInput,
  type PhasePlanning,
  type PlanningSnapshot,
  type Priorite,
  type TypePhase,
} from "@/lib/types";
import {
  SEARCH_DAYS,
  TARGET_LOAD,
  advanceSlot,
  buildOccupancy,
  compareSlots,
  isSlotBlockedForRow,
  lastOccupiedSlotForRow,
  nextOpenSlot,
  occupySlots,
  slotKey,
  slotsFromExistingPhase,
  todayIso,
  workingHalvesFrom,
  allocateHoursFrom,
  occupancySpans,
  isShortTask,
  timeFromMinutes,
  type Half,
  type OccupiedSlot,
} from "./slots";
import {
  capacityHoursForWeek,
  hoursInSlots,
} from "./hours";

export type PlannedPhase = {
  elementIndex: number;
  nom_element: string;
  type_phase: TypePhase;
  duree_estimee_heures: number;
  date_debut: string | null;
  date_fin: string | null;
  heure_debut?: string | null;
  employe_id: string | null;
  urgent: boolean;
  unplaced: boolean;
  reason?: string;
};

export type Displacement = {
  chantier_id: string;
  nom_client: string;
  priorite: Priorite;
  working_days: number;
  phases: {
    phase_id: string;
    type_phase: TypePhase;
    old_debut: string;
    old_fin: string;
    date_debut: string;
    date_fin: string;
    employe_id: string | null;
  }[];
};

export type PlanResult = {
  status: "placed" | "conflict" | "partial" | "blocked";
  phases: PlannedPhase[];
  displacements: Displacement[];
  message: string;
  logisticsGaps: number[];
};

const PRIORITY_RANK: Record<Priorite, number> = {
  pas_presse: 0,
  normal: 1,
  prioritaire: 2,
};

export function canDisplace(
  existing: Priorite,
  incoming: Priorite,
  incomingUrgent: boolean,
): boolean {
  if (!incomingUrgent) return false;
  if (incoming === "pas_presse") return false;
  if (existing === "prioritaire" && incoming !== "prioritaire") return false;
  return PRIORITY_RANK[incoming] >= PRIORITY_RANK[existing];
}

function cloneOcc(occupancy: Map<string, string>): Map<string, string> {
  return new Map(occupancy);
}

function findFreeSlots(
  occupancy: Map<string, string>,
  snapshot: PlanningSnapshot,
  rowId: string,
  start: OccupiedSlot,
  hours: number,
): OccupiedSlot[] | null {
  return allocateHoursFrom(
    occupancy,
    snapshot,
    rowId,
    hours,
    start.date,
    start.half,
    { short: isShortTask(hours), fromMin: start.startMin },
  );
}

function appendStartForRow(
  occupancy: Map<string, string>,
  snapshot: PlanningSnapshot,
  rowId: string,
  notBefore: OccupiedSlot,
): OccupiedSlot {
  const afterExisting = lastOccupiedSlotForRow(occupancy, snapshot, rowId);
  let start = notBefore;
  if (afterExisting && compareSlots(afterExisting, start) > 0) {
    start = afterExisting;
  }
  return nextOpenSlot(snapshot, rowId, start.date, start.half);
}

function placeOnRow(
  occupancy: Map<string, string>,
  snapshot: PlanningSnapshot,
  rowId: string,
  hours: number,
  notBefore: OccupiedSlot,
  mode: "append" | "holes",
): OccupiedSlot[] | null {
  if (hours <= 0) return [];
  const start =
    mode === "append"
      ? appendStartForRow(occupancy, snapshot, rowId, notBefore)
      : nextOpenSlot(snapshot, rowId, notBefore.date, notBefore.half);
  return findFreeSlots(occupancy, snapshot, rowId, start, hours);
}

function weeklyLoadScore(
  occupancy: Map<string, string>,
  snapshot: PlanningSnapshot,
  employeeIds: string[],
): number {
  const hoursByWeek = new Map<string, number>();
  for (const span of occupancySpans(occupancy)) {
    if (!employeeIds.includes(span.rowId)) continue;
    const week = startOfWeekIso(span.date);
    const hours = (span.end - span.start) / 60;
    hoursByWeek.set(week, (hoursByWeek.get(week) ?? 0) + hours);
  }
  if (hoursByWeek.size === 0) return 1;
  let total = 0;
  for (const [week, hours] of Array.from(hoursByWeek.entries())) {
    const capacity = capacityHoursForWeek(snapshot, week, employeeIds);
    if (capacity === 0) continue;
    total += Math.abs(hours / capacity - TARGET_LOAD);
  }
  return total / hoursByWeek.size;
}

function eligibleEmployees(
  snapshot: PlanningSnapshot,
  role: TypePhase,
): string[] {
  return snapshot.employees
    .filter((employee) => employeeCanTakePhase(employee, role))
    .map((employee) => employee.id);
}

function pickEmployeePlacement(
  occupancy: Map<string, string>,
  snapshot: PlanningSnapshot,
  role: TypePhase,
  hours: number,
  notBefore: OccupiedSlot,
  mode: "append" | "holes",
  assignedId: string | null,
): { slots: OccupiedSlot[] | null; reason?: string } {
  if (assignedId) {
    const employee = snapshot.employees.find((item) => item.id === assignedId);
    if (!employee || !employee.actif) {
      return {
        slots: null,
        reason: `L’employé choisi pour ${PHASE_LABELS[role]} n’est pas disponible. La phase n’a pas été réassignée.`,
      };
    }
    if (!employeeCanTakePhase(employee, role)) {
      return {
        slots: null,
        reason: `${employee.nom} n’a pas le rôle ${PHASE_LABELS[role]}. La phase n’a pas été réassignée à quelqu’un d’autre.`,
      };
    }
    const slots = placeOnRow(
      occupancy,
      snapshot,
      assignedId,
      hours,
      { ...notBefore, rowId: assignedId },
      mode,
    );
    if (!slots) {
      return {
        slots: null,
        reason: `Aucun créneau ${PHASE_LABELS[role]} disponible pour ${employee.nom}. La phase n’a pas été réassignée à un autre salarié.`,
      };
    }
    return { slots };
  }

  const ids = eligibleEmployees(snapshot, role);
  if (ids.length === 0) {
    return {
      slots: null,
      reason: `Aucun salarié actif avec le rôle ${PHASE_LABELS[role]}.`,
    };
  }
  let best: OccupiedSlot[] | null = null;
  for (const id of ids) {
    const slots = placeOnRow(
      occupancy,
      snapshot,
      id,
      hours,
      { ...notBefore, rowId: id },
      mode,
    );
    if (!slots || slots.length === 0) continue;
    if (
      !best ||
      compareSlots(slots[slots.length - 1], best[best.length - 1]) < 0
    ) {
      best = slots;
    }
  }
  if (!best) {
    return {
      slots: null,
      reason: `Aucun créneau ${PHASE_LABELS[role]} disponible`,
    };
  }
  return { slots: best };
}

function maxSlot(slots: OccupiedSlot[]): OccupiedSlot | null {
  return slots.reduce<OccupiedSlot | null>((last, slot) => {
    if (!last || compareSlots(slot, last) > 0) return slot;
    return last;
  }, null);
}

function nextAfter(snapshot: PlanningSnapshot, slot: OccupiedSlot): OccupiedSlot {
  const next = advanceSlot(slot.date, slot.half);
  return nextOpenSlot(snapshot, slot.rowId, next.date, next.half);
}

function applyManualPhase(
  elementIndex: number,
  nom: string,
  type: TypePhase,
  hours: number,
  debut: string,
  fin: string,
  employeId: string | null,
  urgent: boolean,
): PlannedPhase {
  return {
    elementIndex,
    nom_element: nom,
    type_phase: type,
    duree_estimee_heures: hours,
    date_debut: debut,
    date_fin: fin,
    employe_id: type === "logistique" ? null : employeId,
    urgent,
    unplaced: false,
  };
}

function unplacedPhase(
  elementIndex: number,
  nom: string,
  type: TypePhase,
  hours: number,
  urgent: boolean,
  reason: string,
  employeId: string | null = null,
): PlannedPhase {
  return {
    elementIndex,
    nom_element: nom,
    type_phase: type,
    duree_estimee_heures: hours,
    date_debut: null,
    date_fin: null,
    employe_id: type === "logistique" ? null : employeId,
    urgent,
    unplaced: true,
    reason,
  };
}

function fromSlots(
  elementIndex: number,
  nom: string,
  type: TypePhase,
  hours: number,
  urgent: boolean,
  slots: OccupiedSlot[],
): PlannedPhase {
  return {
    elementIndex,
    nom_element: nom,
    type_phase: type,
    duree_estimee_heures: hours,
    date_debut: slots[0]?.date ?? null,
    date_fin: slots[slots.length - 1]?.date ?? null,
    employe_id: type === "logistique" ? null : (slots[0]?.rowId ?? null),
    urgent,
    unplaced: slots.length === 0,
    heure_debut:
      slots[0]?.startMin != null ? timeFromMinutes(slots[0].startMin) : null,
  };
}

function overlappingOwners(
  occupancy: Map<string, string>,
  slots: OccupiedSlot[],
): string[] {
  const ids = new Set<string>();
  const busy = occupancySpans(occupancy);
  for (const slot of slots) {
    if (slot.startMin != null && slot.endMin != null) {
      for (const span of busy) {
        if (span.rowId !== slot.rowId || span.date !== slot.date) continue;
        if (span.end <= slot.startMin || span.start >= slot.endMin) continue;
        if (!span.ownerId.startsWith("incoming")) ids.add(span.ownerId);
      }
      continue;
    }
    const owner = occupancy.get(slotKey(slot.rowId, slot.date, slot.half));
    if (owner && !owner.startsWith("incoming")) ids.add(owner);
  }
  return Array.from(ids);
}

function chantierNames(snapshot: PlanningSnapshot, ids: string[]): string {
  return ids
    .map(
      (id) =>
        snapshot.chantiers.find((chantier) => chantier.id === id)?.nom_client ??
        "un chantier existant",
    )
    .join(", ");
}

function employeeName(snapshot: PlanningSnapshot, id: string | null): string {
  if (!id) return "la ligne Thermolaquage";
  return snapshot.employees.find((item) => item.id === id)?.nom ?? "cet employé";
}

function visitContiguousFreeRuns(
  occupancy: Map<string, string>,
  snapshot: PlanningSnapshot,
  rowId: string,
  fromDate: string,
  onRun: (run: OccupiedSlot[]) => boolean,
) {
  const run: OccupiedSlot[] = [];
  let date = fromDate;
  let half: Half = 0;
  let guard = 0;
  const flush = () => {
    if (run.length === 0) return false;
    const stop = onRun([...run]);
    run.length = 0;
    return stop;
  };
  while (guard < SEARCH_DAYS * 2) {
    guard += 1;
    if (isSlotBlockedForRow(snapshot, rowId, date, half)) {
      const next = advanceSlot(date, half);
      date = next.date;
      half = next.half;
      continue;
    }
    if (occupancy.has(slotKey(rowId, date, half))) {
      if (flush()) return;
      const next = advanceSlot(date, half);
      date = next.date;
      half = next.half;
      continue;
    }
    run.push({ rowId, date, half });
    const next = advanceSlot(date, half);
    date = next.date;
    half = next.half;
  }
  flush();
}

function nextContiguousFreeWindow(
  occupancy: Map<string, string>,
  snapshot: PlanningSnapshot,
  rowId: string,
  hours: number,
  fromDate: string,
): { date_debut: string; date_fin: string } | null {
  const slots = allocateHoursFrom(
    occupancy,
    snapshot,
    rowId,
    hours,
    fromDate,
    0,
    { short: isShortTask(hours) },
  );
  if (!slots || slots.length === 0) return null;
  return {
    date_debut: slots[0].date,
    date_fin: slots[slots.length - 1].date,
  };
}

const MAX_OVERTIME_HOURS_PER_DAY = 4;

export type OvertimeFit = {
  date_debut: string;
  date_fin: string;
  workingDays: number;
  extraHoursPerDay: number;
  label: string;
};

function overtimeFitFromRun(
  snapshot: PlanningSnapshot,
  run: OccupiedSlot[],
  neededHours: number,
): OvertimeFit | null {
  const available = hoursInSlots(snapshot, run);
  if (run.length === 0 || available >= neededHours) return null;
  const days = Array.from(new Set(run.map((slot) => slot.date)));
  if (days.length === 0) return null;
  const extraTotal = neededHours - available;
  if (extraTotal <= 0) return null;
  const extraPerDay = extraTotal / days.length;
  if (extraPerDay > MAX_OVERTIME_HOURS_PER_DAY) return null;
  const rounded = Math.round(extraPerDay * 10) / 10;
  return {
    date_debut: run[0].date,
    date_fin: run[run.length - 1].date,
    workingDays: days.length,
    extraHoursPerDay: rounded,
    label: `${formatOvertimeHours(rounded)} par jour pendant ${days.length} jour${days.length > 1 ? "s" : ""}`,
  };
}

function nextOvertimeFit(
  occupancy: Map<string, string>,
  snapshot: PlanningSnapshot,
  rowId: string,
  hours: number,
  fromDate: string,
): OvertimeFit | null {
  if (hours <= 0) return null;
  let found: OvertimeFit | null = null;
  visitContiguousFreeRuns(occupancy, snapshot, rowId, fromDate, (run) => {
    if (hoursInSlots(snapshot, run) >= hours) return true;
    const fit = overtimeFitFromRun(snapshot, run, hours);
    if (fit) {
      found = fit;
      return true;
    }
    return false;
  });
  return found;
}

function resolveManualRow(
  snapshot: PlanningSnapshot,
  occupancy: Map<string, string>,
  type: TypePhase,
  hours: number,
  debut: string,
  fin: string,
  assignedId: string | null,
): { rowId: string; employeId: string | null } | { reason: string } {
  if (type === "logistique") {
    return { rowId: LOGISTIQUE_ROW_ID, employeId: null };
  }
  if (assignedId) {
    return { rowId: assignedId, employeId: assignedId };
  }
  const eligible = eligibleEmployees(snapshot, type);
  const free = eligible.find((id) => {
    const slots = slotsFromExistingPhase(snapshot, {
      type_phase: type,
      employe_id: id,
      date_debut: debut,
      date_fin: fin,
      duree_estimee_heures: hours,
    });
    return overlappingOwners(occupancy, slots).length === 0 && slots.length > 0;
  });
  if (free) return { rowId: free, employeId: free };
  if (eligible[0]) return { rowId: eligible[0], employeId: eligible[0] };
  return {
    reason: `Aucun salarié actif avec le rôle ${PHASE_LABELS[type]} pour ces dates manuelles.`,
  };
}

type PlaceOptions = {
  mode: "append" | "holes";
  occupancy: Map<string, string>;
  logisticsGap: number;
};

function placeChantierOnOccupancy(
  snapshot: PlanningSnapshot,
  input: NewChantierInput,
  urgent: boolean,
  options: PlaceOptions,
): { phases: PlannedPhase[]; occupancy: Map<string, string>; gaps: number[] } {
  const occupancy = cloneOcc(options.occupancy);
  const phases: PlannedPhase[] = [];
  const gaps: number[] = [];
  const notBeforeBase: OccupiedSlot = {
    rowId: "",
    date: todayIso(),
    half: 0,
  };

  input.elements.forEach((element, elementIndex) => {
    let cursor = { ...notBeforeBase };
    let fabEnd: OccupiedSlot | null = null;
    let logEnd: OccupiedSlot | null = null;
    let livEnd: OccupiedSlot | null = null;

    for (const type of ["administratif", "fabrication", "logistique", "livraison", "pose"] as TypePhase[]) {
      const source = element.phases.find((phase) => phase.type_phase === type);
      const hours = source?.duree_estimee_heures ?? 0;
      const phaseUrgent = urgent || Boolean(source?.urgent);

      if (source?.date_debut) {
        const debut = source.date_debut;
        const fin = source.date_fin || source.date_debut;
        const resolved = resolveManualRow(
          snapshot,
          occupancy,
          type,
          hours,
          debut,
          fin,
          source.employe_id,
        );
        if ("reason" in resolved) {
          phases.push(
            unplacedPhase(
              elementIndex,
              element.nom_element,
              type,
              hours,
              phaseUrgent,
              resolved.reason,
              source.employe_id,
            ),
          );
          continue;
        }
        const manualSlots = slotsFromExistingPhase(snapshot, {
          type_phase: type,
          employe_id: resolved.employeId,
          date_debut: debut,
          date_fin: fin,
          duree_estimee_heures: hours,
        });
        const owners = overlappingOwners(occupancy, manualSlots);
        const blocking = owners.filter((id) => {
          const chantier = chantierById(snapshot, id);
          if (!chantier) return true;
          return !canDisplace(chantier.priorite, input.priorite, urgent);
        });
        if (blocking.length > 0) {
          const who = employeeName(snapshot, resolved.employeId);
          const occupiedBy = chantierNames(snapshot, blocking);
          const next = nextContiguousFreeWindow(
            occupancy,
            snapshot,
            resolved.rowId,
            hours,
            debut,
          );
          const nextText = next
            ? ` Prochain créneau libre pour ${who} : ${formatLongDate(next.date_debut)}.`
            : "";
          phases.push(
            unplacedPhase(
              elementIndex,
              element.nom_element,
              type,
              hours,
              phaseUrgent,
              `Les dates du ${PHASE_LABELS[type]} (${formatLongDate(debut)} → ${formatLongDate(fin)}) chevauchent « ${occupiedBy} » dans le planning de ${who}.${nextText}`,
              resolved.employeId,
            ),
          );
          continue;
        }
        occupySlots(occupancy, manualSlots, `incoming-${elementIndex}`);
        const placed = applyManualPhase(
          elementIndex,
          element.nom_element,
          type,
          hours,
          debut,
          fin,
          resolved.employeId,
          phaseUrgent,
        );
        phases.push(placed);
        const last: OccupiedSlot = {
          rowId: resolved.rowId,
          date: placed.date_fin!,
          half: 1,
        };
        cursor = nextAfter(snapshot, last);
        if (type === "fabrication") fabEnd = last;
        if (type === "logistique") logEnd = last;
        if (type === "livraison") livEnd = last;
        continue;
      }

      if (type === "livraison" && hours <= 0) {
        continue;
      }

      if (hours <= 0) {
        phases.push(
          unplacedPhase(
            elementIndex,
            element.nom_element,
            type,
            hours,
            phaseUrgent,
            "Durée nulle — phase ignorée",
            source?.employe_id ?? null,
          ),
        );
        continue;
      }

      if (type === "livraison") {
        const after = logEnd ?? fabEnd;
        if (after) {
          const next = nextAfter(snapshot, after);
          if (next.date > cursor.date || (next.date === cursor.date && next.half > cursor.half)) {
            cursor = { rowId: cursor.rowId, date: next.date, half: next.half };
          }
        }
      }

      if (type === "pose") {
        const after = livEnd ?? logEnd ?? fabEnd;
        if (after) {
          const next = nextAfter(snapshot, after);
          if (next.date > cursor.date || (next.date === cursor.date && next.half > cursor.half)) {
            cursor = { rowId: cursor.rowId, date: next.date, half: next.half };
          }
        }
      }

      let slots: OccupiedSlot[] | null = null;
      let failReason: string | undefined;
      if (type === "logistique") {
        slots = placeOnRow(
          occupancy,
          snapshot,
          LOGISTIQUE_ROW_ID,
          hours,
          { ...cursor, rowId: LOGISTIQUE_ROW_ID },
          options.mode,
        );
        if (!slots) {
          failReason = `Aucun créneau ${PHASE_LABELS[type]} disponible`;
        }
      } else {
        const picked = pickEmployeePlacement(
          occupancy,
          snapshot,
          type,
          hours,
          cursor,
          options.mode,
          source?.employe_id ?? null,
        );
        slots = picked.slots;
        failReason = picked.reason;
      }

      if (!slots) {
        phases.push(
          unplacedPhase(
            elementIndex,
            element.nom_element,
            type,
            hours,
            phaseUrgent,
            failReason ?? `Aucun créneau ${PHASE_LABELS[type]} disponible`,
            source?.employe_id ?? null,
          ),
        );
        continue;
      }

      occupySlots(occupancy, slots, `incoming-${elementIndex}`);
      const placed = fromSlots(
        elementIndex,
        element.nom_element,
        type,
        hours,
        phaseUrgent,
        slots,
      );
      phases.push(placed);
      const last = maxSlot(slots);
      if (last) {
        cursor = nextAfter(snapshot, last);
        if (type === "fabrication") fabEnd = last;
        if (type === "logistique") logEnd = last;
        if (type === "livraison") livEnd = last;
        if (type === "pose" && fabEnd) {
          gaps.push(
            Math.max(
              0,
              Math.round(
                (Date.parse(placed.date_debut ?? fabEnd.date) -
                  Date.parse(fabEnd.date)) /
                  86400000,
              ),
            ),
          );
        }
      }
    }
  });

  return { phases, occupancy, gaps };
}

function chantierById(snapshot: PlanningSnapshot, id: string) {
  return snapshot.chantiers.find((chantier) => chantier.id === id);
}

function shiftPhaseDates(phase: PhasePlanning, workingDays: number) {
  if (!phase.date_debut || !phase.date_fin) return phase;
  return {
    ...phase,
    date_debut: addWorkingDays(phase.date_debut, workingDays),
    date_fin: addWorkingDays(phase.date_fin, workingDays),
  };
}

function occupancyKeepingNonDisplaceable(
  snapshot: PlanningSnapshot,
  incomingPriorite: Priorite,
  incomingUrgent: boolean,
): Map<string, string> {
  const occupancy = new Map<string, string>();
  for (const phase of snapshot.phases) {
    const element = snapshot.elements.find((item) => item.id === phase.element_id);
    if (!element) continue;
    const chantier = chantierById(snapshot, element.chantier_id);
    if (!chantier) continue;
    if (canDisplace(chantier.priorite, incomingPriorite, incomingUrgent)) continue;
    occupySlots(occupancy, slotsFromExistingPhase(snapshot, phase), chantier.id);
  }
  return occupancy;
}

function incomingSlotsFromPlan(
  snapshot: PlanningSnapshot,
  phases: PlannedPhase[],
): OccupiedSlot[] {
  const slots: OccupiedSlot[] = [];
  for (const phase of phases) {
    if (!phase.date_debut || phase.unplaced) continue;
    const hours = phase.duree_estimee_heures;
    const rowId =
      phase.type_phase === "logistique" ? LOGISTIQUE_ROW_ID : phase.employe_id;
    if (!rowId || hours <= 0) continue;
    slots.push(...workingHalvesFrom(snapshot, rowId, phase.date_debut, 0, hours));
  }
  return slots;
}

function buildDisplacements(
  snapshot: PlanningSnapshot,
  occupancyFull: Map<string, string>,
  incoming: PlannedPhase[],
  priorite: Priorite,
  urgent: boolean,
): Displacement[] {
  const slots = incomingSlotsFromPlan(snapshot, incoming);
  const blockedChantierIds = new Set<string>();
  for (const slot of slots) {
    const owner = occupancyFull.get(slotKey(slot.rowId, slot.date, slot.half));
    if (owner && !owner.startsWith("incoming")) blockedChantierIds.add(owner);
  }

  const displacements: Displacement[] = [];
  for (const chantierId of Array.from(blockedChantierIds)) {
    const chantier = chantierById(snapshot, chantierId);
    if (!chantier) continue;
    if (!canDisplace(chantier.priorite, priorite, urgent)) continue;

    const chantierPhases = snapshot.phases.filter((phase) => {
      const element = snapshot.elements.find((item) => item.id === phase.element_id);
      return element?.chantier_id === chantierId && phase.date_debut && phase.date_fin;
    });

    let shift = 1;
    let resolved = false;
    let shifted = chantierPhases;
    while (shift <= 40 && !resolved) {
      shifted = chantierPhases.map((phase) => shiftPhaseDates(phase, shift));
      const stillOverlap = slots.some((slot) =>
        shifted.some((phase) => {
          const rowId =
            phase.type_phase === "logistique"
              ? LOGISTIQUE_ROW_ID
              : phase.employe_id;
          return (
            rowId === slot.rowId &&
            phase.date_debut! <= slot.date &&
            phase.date_fin! >= slot.date
          );
        }),
      );
      if (!stillOverlap) resolved = true;
      else shift += 1;
    }
    if (!resolved) continue;
    displacements.push({
      chantier_id: chantierId,
      nom_client: chantier.nom_client,
      priorite: chantier.priorite,
      working_days: shift,
      phases: shifted.map((phase) => {
        const original = chantierPhases.find((item) => item.id === phase.id)!;
        return {
          phase_id: phase.id,
          type_phase: phase.type_phase,
          old_debut: original.date_debut!,
          old_fin: original.date_fin!,
          date_debut: phase.date_debut!,
          date_fin: phase.date_fin!,
          employe_id: phase.employe_id,
        };
      }),
    });
  }
  return displacements;
}

export function planChantier(
  snapshot: PlanningSnapshot,
  input: NewChantierInput,
  options: { urgent: boolean } = { urgent: false },
): PlanResult {
  const fullOcc = buildOccupancy(snapshot);
  const employeeIds = snapshot.employees
    .filter((employee) => employee.actif)
    .map((employee) => employee.id);

  const result = placeChantierOnOccupancy(snapshot, input, options.urgent, {
    mode: options.urgent ? "holes" : "append",
    occupancy: fullOcc,
    logisticsGap: 0,
  });
  const best = result;
  if (!best) {
    return {
      status: "partial",
      phases: [],
      displacements: [],
      message: "Placement impossible.",
      logisticsGaps: [],
    };
  }

  const unplaced = best.phases.filter(
    (phase) => phase.unplaced && phase.duree_estimee_heures > 0,
  );
  const loadNote = weeklyLoadScore(best.occupancy, snapshot, employeeIds);

  if (options.urgent) {
    const kept = occupancyKeepingNonDisplaceable(
      snapshot,
      input.priorite,
      true,
    );
    const squeezed = placeChantierOnOccupancy(snapshot, input, true, {
      mode: "holes",
      occupancy: kept,
      logisticsGap: 0,
    });
    const displacements = buildDisplacements(
      snapshot,
      fullOcc,
      squeezed.phases.filter((phase) => !phase.unplaced),
      input.priorite,
      true,
    );
    if (displacements.length > 0) {
      return {
        status: "conflict",
        phases: squeezed.phases,
        displacements,
        message:
          "Ce chantier urgent s’insère entre des affaires déjà planifiées. Validez les décalages proposés, ou ajustez en le plaçant à la suite sans rien déplacer.",
        logisticsGaps: squeezed.gaps,
      };
    }
  }

  if (unplaced.length > 0) {
    const details = unplaced
      .map((phase) => phase.reason)
      .filter((reason): reason is string => Boolean(reason))
      .join(" ");
    const blocked = unplaced.some((phase) =>
      (phase.reason ?? "").includes("chevauchent"),
    );
    return {
      status: blocked && !options.urgent ? "blocked" : "partial",
      phases: best.phases,
      displacements: [],
      message:
        details ||
        `${unplaced.length} phase(s) n’ont pas trouvé de créneau. Le reste a été posé (écart à 80 % : ${(loadNote * 100).toFixed(0)} pts).`,
      logisticsGaps: best.gaps,
    };
  }

  return {
    status: "placed",
    phases: best.phases,
    displacements: [],
    message: "Placement trouvé à la suite (fabrication → thermolaquage → pose), sans écraser l’existant.",
    logisticsGaps: best.gaps,
  };
}

function weekHoursForEmployee(
  occupancy: Map<string, string>,
  snapshot: PlanningSnapshot,
  employeeId: string,
  weekStart: string,
): number {
  let hours = 0;
  const last = addDays(weekStart, 6);
  for (const span of occupancySpans(occupancy)) {
    if (span.rowId !== employeeId) continue;
    if (span.date < weekStart || span.date > last) continue;
    hours += (span.end - span.start) / 60;
  }
  return Math.round(hours * 10) / 10;
}

export type PlacementAlternative = {
  employeeId: string;
  nom: string;
  freeOnSlot: boolean;
  availableFrom: string | null;
  nextWindow: { date_debut: string; date_fin: string } | null;
  impact: string | null;
  weekHours: number;
};

export type SlotConflict = {
  elementIndex: number;
  nom_element: string;
  type_phase: TypePhase;
  employe_id: string | null;
  date_debut: string;
  date_fin: string;
  occupiedBy: string;
  nextFree: { date_debut: string; date_fin: string } | null;
  overtime: OvertimeFit | null;
  alternatives: PlacementAlternative[];
  message: string;
};

function overlappingPhasesForEmployee(
  snapshot: PlanningSnapshot,
  employeeId: string,
  type: TypePhase,
  debut: string,
  fin: string,
  hours: number,
): PhasePlanning[] {
  const wanted = slotsFromExistingPhase(snapshot, {
    type_phase: type,
    employe_id: employeeId,
    date_debut: debut,
    date_fin: fin,
    duree_estimee_heures: hours,
  });
  const keys = new Set(
    wanted.map((slot) => slotKey(slot.rowId, slot.date, slot.half)),
  );
  return snapshot.phases.filter((phase) => {
    if (phase.employe_id !== employeeId) return false;
    return slotsFromExistingPhase(snapshot, phase).some((slot) =>
      keys.has(slotKey(slot.rowId, slot.date, slot.half)),
    );
  });
}

export function listPlacementAlternatives(
  snapshot: PlanningSnapshot,
  type: TypePhase,
  hours: number,
  debut: string,
  fin: string,
  currentEmployeeId: string | null,
): PlacementAlternative[] {
  if (type === "logistique") return [];
  const occupancy = buildOccupancy(snapshot);
  const rows: PlacementAlternative[] = [];
  for (const employee of snapshot.employees) {
    if (!employeeCanTakePhase(employee, type)) continue;
    if (employee.id === currentEmployeeId) continue;
    const overlapping = overlappingPhasesForEmployee(
      snapshot,
      employee.id,
      type,
      debut,
      fin,
      hours,
    );
    const wanted = slotsFromExistingPhase(snapshot, {
      type_phase: type,
      employe_id: employee.id,
      date_debut: debut,
      date_fin: fin,
      duree_estimee_heures: hours,
    });
    const hoursOnSlot = hoursInSlots(
      snapshot,
      wanted.filter((slot) => slot.date >= debut && slot.date <= fin),
    );
    if (hoursOnSlot <= 0) continue;
    const nextWindow = nextContiguousFreeWindow(
      occupancy,
      snapshot,
      employee.id,
      hours,
      debut,
    );
    const freeOnSlot = hoursOnSlot >= hours && overlapping.length === 0;
    const weekHours = weekHoursForEmployee(
      occupancy,
      snapshot,
      employee.id,
      startOfWeekIso(debut),
    );
    let impact: string | null = null;
    if (!freeOnSlot) {
      if (overlapping.length > 0) {
        const labels = overlapping.map((phase) => {
          const element = snapshot.elements.find((item) => item.id === phase.element_id);
          const chantier = snapshot.chantiers.find(
            (item) => item.id === element?.chantier_id,
          );
          const when =
            phase.date_debut && phase.date_fin
              ? `${formatLongDate(phase.date_debut)} → ${formatLongDate(phase.date_fin)}`
              : "";
          return `${chantier?.nom_client ?? "chantier"} (${PHASE_LABELS[phase.type_phase]}${when ? `, ${when}` : ""})`;
        });
        impact = `Occupe déjà ${labels.join(" ; ")}. Le décaler libérerait le créneau.`;
      } else {
        impact =
          "Ne travaille pas (ou pas assez) sur ce créneau selon son contrat.";
      }
    }
    rows.push({
      employeeId: employee.id,
      nom: employee.nom,
      freeOnSlot,
      availableFrom: freeOnSlot ? debut : (nextWindow?.date_debut ?? null),
      nextWindow: freeOnSlot
        ? { date_debut: debut, date_fin: fin }
        : nextWindow,
      impact,
      weekHours,
    });
  }
  rows.sort((a, b) => {
    if (a.freeOnSlot !== b.freeOnSlot) return a.freeOnSlot ? -1 : 1;
    if (a.freeOnSlot && a.weekHours !== b.weekHours) {
      return a.weekHours - b.weekHours;
    }
    const da = a.availableFrom ?? "9999";
    const db = b.availableFrom ?? "9999";
    if (da !== db) return da.localeCompare(db);
    if (a.weekHours !== b.weekHours) return a.weekHours - b.weekHours;
    return a.nom.localeCompare(b.nom, "fr");
  });
  return rows;
}

export function inspectManualSlotConflict(
  snapshot: PlanningSnapshot,
  input: NewChantierInput,
): SlotConflict | null {
  const occupancy = buildOccupancy(snapshot);
  for (let elementIndex = 0; elementIndex < input.elements.length; elementIndex += 1) {
    const element = input.elements[elementIndex];
    for (const phase of element.phases) {
      if (!phase.date_debut) continue;
      if (phase.type_phase === "logistique") continue;
      const debut = phase.date_debut;
      const fin = phase.date_fin || phase.date_debut;
      const resolved = resolveManualRow(
        snapshot,
        occupancy,
        phase.type_phase,
        phase.duree_estimee_heures,
        debut,
        fin,
        phase.employe_id,
      );
      if ("reason" in resolved) continue;
      const slots = slotsFromExistingPhase(snapshot, {
        type_phase: phase.type_phase,
        employe_id: resolved.employeId,
        date_debut: debut,
        date_fin: fin,
        duree_estimee_heures: phase.duree_estimee_heures,
      });
      const owners = overlappingOwners(occupancy, slots);
      if (owners.length === 0) continue;
      const who = employeeName(snapshot, resolved.employeId);
      const occupiedBy = chantierNames(snapshot, owners);
      const nextFree = nextContiguousFreeWindow(
        occupancy,
        snapshot,
        resolved.rowId,
        phase.duree_estimee_heures,
        debut,
      );
      const overtime = nextOvertimeFit(
        occupancy,
        snapshot,
        resolved.rowId,
        phase.duree_estimee_heures,
        debut,
      );
      const nextText = nextFree
        ? ` Prochain créneau libre pour ${who} : ${formatLongDate(nextFree.date_debut)}.`
        : "";
      return {
        elementIndex,
        nom_element: element.nom_element,
        type_phase: phase.type_phase,
        employe_id: resolved.employeId,
        date_debut: debut,
        date_fin: fin,
        occupiedBy,
        nextFree,
        overtime,
        alternatives: listPlacementAlternatives(
          snapshot,
          phase.type_phase,
          phase.duree_estimee_heures,
          debut,
          fin,
          resolved.employeId,
        ),
        message: `Les dates du ${PHASE_LABELS[phase.type_phase]} (${formatLongDate(debut)} → ${formatLongDate(fin)}) chevauchent « ${occupiedBy} » dans le planning de ${who}.${nextText}`,
      };
    }
  }
  return null;
}

export function describeManualDateConflicts(
  snapshot: PlanningSnapshot,
  input: NewChantierInput,
): string | null {
  return inspectManualSlotConflict(snapshot, input)?.message ?? null;
}

export function mergePlanIntoInput(
  input: NewChantierInput,
  planned: PlannedPhase[],
  urgent: boolean,
): NewChantierInput {
  return {
    ...input,
    elements: input.elements.map((element, elementIndex) => ({
      ...element,
      phases: element.phases.map((phase) => {
        const match = planned.find(
          (item) =>
            item.elementIndex === elementIndex && item.type_phase === phase.type_phase,
        );
        if (!match) {
          return { ...phase, urgent: urgent || phase.urgent };
        }
        return {
          ...phase,
          date_debut: match.date_debut,
          date_fin: match.date_fin,
          employe_id: match.employe_id,
          heure_debut: match.heure_debut ?? phase.heure_debut ?? null,
          urgent: urgent || phase.urgent || match.urgent,
        };
      }),
    })),
  };
}
