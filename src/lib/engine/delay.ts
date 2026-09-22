import { addDays, addWorkingDays, datesOverlap, isWeekend, shiftToReach, workingDaysBetween } from "@/lib/dates";
import { canPriorityDisplace, chantierToleranceWorkingDays } from "@/lib/priorite";
import {
  TYPES_PHASE,
  isVirtualPlanningRow,
  type Chantier,
  type PhasePatch,
  type PhasePlanning,
  type PlanningSnapshot,
  type Priorite,
  type TypePhase,
} from "@/lib/types";
import type { Displacement } from "./planner";
import {
  linkedPosePhases,
  planLinkedPoseMove,
} from "@/lib/engine/linked-pose";
import {
  MIN_LOGISTICS_WORKING_DAYS,
  SEARCH_DAYS,
  isSlotBlockedForRow,
  rowIdForPhase,
} from "./slots";

export type DelayScope = "dependances" | "chantier";

export type DelayPlanResult = {
  status: "ok" | "conflict";
  patches: PhasePatch[];
  displacements: Displacement[];
  message: string;
  chosenStart?: string;
};

export function delayToWorkingDays(halfDays: number): number {
  if (halfDays === 0) return 0;
  return Math.max(1, Math.ceil(Math.abs(halfDays) / 2));
}

export function canCascadeDisplace(
  existing: Priorite,
  incoming: Priorite,
): boolean {
  return canPriorityDisplace(existing, incoming);
}

type Dated = { debut: string; fin: string };

function chantierOf(
  snapshot: PlanningSnapshot,
  phase: PhasePlanning,
): Chantier | undefined {
  const element = snapshot.elements.find((item) => item.id === phase.element_id);
  if (!element) return undefined;
  return snapshot.chantiers.find((item) => item.id === element.chantier_id);
}

function laterType(phase: PhasePlanning, origin: PhasePlanning): boolean {
  if (phase.element_id !== origin.element_id) return false;
  return (
    TYPES_PHASE.indexOf(phase.type_phase as TypePhase) >
    TYPES_PHASE.indexOf(origin.type_phase)
  );
}

function exclusiveRowId(phase: PhasePlanning): string | null {
  const rowId = rowIdForPhase(phase.type_phase, phase.employe_id);
  if (!rowId || isVirtualPlanningRow(rowId)) return null;
  return rowId;
}

function laterOnExclusiveRow(
  phase: PhasePlanning,
  current: PhasePlanning,
): boolean {
  const currentRow = exclusiveRowId(current);
  const rowId = exclusiveRowId(phase);
  return Boolean(currentRow && rowId === currentRow && originalOrder(phase, current) > 0);
}

function phaseDatesMoved(
  phase: PhasePlanning,
  dates: Map<string, Dated>,
): boolean {
  const next = dates.get(phase.id);
  if (!next) return false;
  return next.debut !== phase.date_debut || next.fin !== phase.date_fin;
}

function logisticsPredecessorMoved(
  snapshot: PlanningSnapshot,
  phase: PhasePlanning,
  dates: Map<string, Dated>,
  origin: PhasePlanning,
): boolean {
  const siblings = datedPhases(snapshot).filter(
    (item) => item.element_id === phase.element_id,
  );
  const fab = siblings.find((item) => item.type_phase === "fabrication");
  const log = siblings.find((item) => item.type_phase === "logistique");
  const liv = siblings.find((item) => item.type_phase === "livraison");
  const preds: PhasePlanning[] = [];
  if (phase.type_phase === "logistique" && fab) preds.push(fab);
  if (phase.type_phase === "livraison") {
    if (log) preds.push(log);
    if (fab) preds.push(fab);
  }
  if (phase.type_phase === "pose") {
    if (liv) preds.push(liv);
    if (log) preds.push(log);
    if (fab) preds.push(fab);
  }
  return preds.some(
    (item) => item.id === origin.id || phaseDatesMoved(item, dates),
  );
}

function originalOrder(a: PhasePlanning, b: PhasePlanning): number {
  const start = a.date_debut!.localeCompare(b.date_debut!);
  if (start !== 0) return start;
  const end = a.date_fin!.localeCompare(b.date_fin!);
  if (end !== 0) return end;
  return a.id.localeCompare(b.id);
}

function datedPhases(snapshot: PlanningSnapshot): PhasePlanning[] {
  return snapshot.phases.filter(
    (phase) => Boolean(phase.date_debut) && Boolean(phase.date_fin),
  );
}

function maxDate(a: string, b: string): string {
  return a >= b ? a : b;
}

function nextOpenDay(
  snapshot: PlanningSnapshot,
  rowId: string,
  afterIso: string,
): string {
  let date = addDays(afterIso, 1);
  for (let i = 0; i < SEARCH_DAYS; i += 1) {
    if (!isSlotBlockedForRow(snapshot, rowId, date)) return date;
    date = addDays(date, 1);
  }
  return date;
}

function firstOpenOnOrAfter(
  snapshot: PlanningSnapshot,
  rowId: string,
  iso: string,
): string {
  let date = iso;
  for (let i = 0; i < SEARCH_DAYS; i += 1) {
    if (!isSlotBlockedForRow(snapshot, rowId, date)) return date;
    date = addDays(date, 1);
  }
  return date;
}

function lastOpenOnOrBefore(
  snapshot: PlanningSnapshot,
  rowId: string,
  iso: string,
): string {
  let date = iso;
  for (let i = 0; i < SEARCH_DAYS; i += 1) {
    if (!isSlotBlockedForRow(snapshot, rowId, date)) return date;
    date = addDays(date, -1);
  }
  return date;
}

function addOpenDays(
  snapshot: PlanningSnapshot,
  rowId: string,
  start: string,
  n: number,
): string {
  if (n <= 0) return start;
  let date = start;
  let added = 0;
  for (let i = 0; i < SEARCH_DAYS && added < n; i += 1) {
    date = addDays(date, 1);
    if (!isSlotBlockedForRow(snapshot, rowId, date)) added += 1;
  }
  return date;
}

function logisticsFloor(oldGap: number): number {
  if (oldGap >= MIN_LOGISTICS_WORKING_DAYS) {
    return Math.max(
      MIN_LOGISTICS_WORKING_DAYS,
      Math.min(oldGap, MIN_LOGISTICS_WORKING_DAYS + 1),
    );
  }
  return oldGap;
}

function collectRelocatable(
  snapshot: PlanningSnapshot,
  origin: PhasePlanning,
): Set<string> {
  const relocatable = new Set<string>();
  const all = datedPhases(snapshot);

  for (const phase of all) {
    if (phase.id === origin.id || phase.statut === "termine") continue;
    if (laterOnExclusiveRow(phase, origin) || laterType(phase, origin)) {
      relocatable.add(phase.id);
    }
  }

  let added = true;
  while (added) {
    added = false;
    for (const current of all) {
      if (!relocatable.has(current.id)) continue;
      for (const phase of all) {
        if (phase.id === origin.id || phase.statut === "termine") continue;
        if (relocatable.has(phase.id)) continue;
        if (laterType(phase, current) || laterOnExclusiveRow(phase, current)) {
          relocatable.add(phase.id);
          added = true;
        }
      }
    }
  }
  return relocatable;
}

function minStartForPhase(
  snapshot: PlanningSnapshot,
  phase: PhasePlanning,
  dates: Map<string, Dated>,
  rowId: string,
): string | null {
  const siblings = datedPhases(snapshot).filter(
    (item) => item.element_id === phase.element_id,
  );
  const fab = siblings.find((item) => item.type_phase === "fabrication");
  const log = siblings.find((item) => item.type_phase === "logistique");
  const liv = siblings.find((item) => item.type_phase === "livraison");
  let min: string | null = null;

  if (phase.type_phase === "logistique" && fab) {
    const fabDates = dates.get(fab.id);
    if (fabDates) min = nextOpenDay(snapshot, rowId, fabDates.fin);
  }
  if (phase.type_phase === "livraison" && log) {
    const logDates = dates.get(log.id);
    if (logDates) {
      const afterLog = nextOpenDay(snapshot, rowId, logDates.fin);
      min = min ? maxDate(min, afterLog) : afterLog;
    }
  }
  if (phase.type_phase === "livraison" && fab) {
    const fabDates = dates.get(fab.id);
    if (fabDates) {
      const afterFab = nextOpenDay(snapshot, rowId, fabDates.fin);
      min = min ? maxDate(min, afterFab) : afterFab;
    }
  }
  if (phase.type_phase === "pose" && liv) {
    const livDates = dates.get(liv.id);
    if (livDates) {
      const afterLiv = nextOpenDay(snapshot, rowId, livDates.fin);
      min = min ? maxDate(min, afterLiv) : afterLiv;
    }
  }
  if (phase.type_phase === "pose" && log) {
    const logDates = dates.get(log.id);
    if (logDates) {
      const afterLog = nextOpenDay(snapshot, rowId, logDates.fin);
      min = min ? maxDate(min, afterLog) : afterLog;
    }
  }
  if (phase.type_phase === "pose" && fab && fab.date_fin && phase.date_debut) {
    const fabDates = dates.get(fab.id);
    if (fabDates) {
      const floor = logisticsFloor(
        workingDaysBetween(fab.date_fin, phase.date_debut),
      );
      const afterFab = firstOpenOnOrAfter(
        snapshot,
        rowId,
        addWorkingDays(fabDates.fin, floor),
      );
      min = min ? maxDate(min, afterFab) : afterFab;
    }
  }
  return min;
}

function placePhase(
  snapshot: PlanningSnapshot,
  phase: PhasePlanning,
  start: string,
): Dated {
  const rowId = rowIdForPhase(phase.type_phase, phase.employe_id);
  const openStart = rowId
    ? firstOpenOnOrAfter(snapshot, rowId, start)
    : start;
  const span = workingDaysBetween(phase.date_debut!, phase.date_fin!);
  const fin = rowId
    ? addOpenDays(snapshot, rowId, openStart, span)
    : addWorkingDays(openStart, span);
  return { debut: openStart, fin };
}

function advanceOriginDates(
  snapshot: PlanningSnapshot,
  origin: PhasePlanning,
  workingDays: number,
): Dated {
  const shrunkFin = addWorkingDays(origin.date_fin!, -workingDays);
  if (shrunkFin >= origin.date_debut!) {
    return { debut: origin.date_debut!, fin: shrunkFin };
  }
  const rowId = rowIdForPhase(origin.type_phase, origin.employe_id);
  const rawStart = addWorkingDays(origin.date_debut!, -workingDays);
  const start = rowId ? lastOpenOnOrBefore(snapshot, rowId, rawStart) : rawStart;
  return placePhase(snapshot, origin, start);
}

function packCascade(
  snapshot: PlanningSnapshot,
  origin: PhasePlanning,
  originDates: Dated,
  relocatable: Set<string>,
  direction: 1 | -1 = 1,
  workingDays = 0,
): { dates: Map<string, Dated>; blocked: boolean } {
  const dates = new Map<string, Dated>();
  for (const phase of datedPhases(snapshot)) {
    dates.set(phase.id, {
      debut: phase.date_debut!,
      fin: phase.date_fin!,
    });
  }
  dates.set(origin.id, originDates);

  let blocked = false;
  for (let guard = 0; guard < 80; guard += 1) {
    let changed = false;
    const byRow = new Map<string, PhasePlanning[]>();
    for (const phase of datedPhases(snapshot)) {
      const rowId = rowIdForPhase(phase.type_phase, phase.employe_id);
      if (!rowId) continue;
      const list = byRow.get(rowId) ?? [];
      list.push(phase);
      byRow.set(rowId, list);
    }

    Array.from(byRow.entries()).forEach(([rowId, list]) => {
      list.sort(originalOrder);
      for (let i = 0; i < list.length; i += 1) {
        const phase = list[i];
        if (phase.id === origin.id) {
          const next = originDates;
          const current = dates.get(phase.id)!;
          if (current.debut !== next.debut || current.fin !== next.fin) {
            dates.set(phase.id, next);
            changed = true;
          }
          continue;
        }
        if (!relocatable.has(phase.id)) continue;
        const current = dates.get(phase.id)!;
        const prevPhase = i === 0 ? undefined : list[i - 1];
        const prev = prevPhase ? dates.get(prevPhase.id) : undefined;
        const prevMoved = Boolean(
          prevPhase &&
            (prevPhase.id === origin.id || phaseDatesMoved(prevPhase, dates)),
        );
        let start = current.debut;
        if (direction < 0) {
          const pullFollowers =
            laterType(phase, origin) ||
            (prevMoved &&
              !isVirtualPlanningRow(rowId) &&
              prev &&
              datesOverlap(prev.debut, prev.fin, current.debut, current.fin));
          if (pullFollowers && workingDays > 0) {
            start = addWorkingDays(current.debut, -workingDays);
          }
          if (prev && !isVirtualPlanningRow(rowId)) {
            start = maxDate(start, nextOpenDay(snapshot, rowId, prev.fin));
          }
          const logistics = minStartForPhase(snapshot, phase, dates, rowId);
          if (logistics) start = maxDate(start, logistics);
          if (start >= current.debut) continue;
        } else {
          if (
            !isVirtualPlanningRow(rowId) &&
            prevMoved &&
            prev &&
            datesOverlap(prev.debut, prev.fin, current.debut, current.fin)
          ) {
            start = maxDate(start, nextOpenDay(snapshot, rowId, prev.fin));
          }
          if (logisticsPredecessorMoved(snapshot, phase, dates, origin)) {
            const logistics = minStartForPhase(snapshot, phase, dates, rowId);
            if (logistics && logistics > start) {
              start = logistics;
            }
          }
          if (start === current.debut) continue;
        }
        const placed = placePhase(snapshot, phase, start);
        if (current.debut === placed.debut && current.fin === placed.fin) continue;
        const originChantier = chantierOf(snapshot, origin);
        const chantier = chantierOf(snapshot, phase);
        if (
          placed.debut > phase.date_debut! &&
          chantier &&
          originChantier &&
          chantier.id !== originChantier.id &&
          !canCascadeDisplace(chantier.priorite, originChantier.priorite)
        ) {
          blocked = true;
        }
        dates.set(phase.id, placed);
        changed = true;
      }
    });
    if (!changed) break;
  }
  return { dates, blocked };
}

function buildDisplacements(
  snapshot: PlanningSnapshot,
  origin: PhasePlanning,
  patches: PhasePatch[],
): Displacement[] {
  const originChantier = chantierOf(snapshot, origin);
  const byChantier = new Map<string, PhasePatch[]>();
  for (const patch of patches) {
    const phase = snapshot.phases.find((item) => item.id === patch.id);
    if (!phase) continue;
    const chantier = chantierOf(snapshot, phase);
    if (!chantier || chantier.id === originChantier?.id) continue;
    const list = byChantier.get(chantier.id) ?? [];
    list.push(patch);
    byChantier.set(chantier.id, list);
  }
  const displacements: Displacement[] = [];
  Array.from(byChantier.entries()).forEach(([chantierId, phasePatches]) => {
    const chantier = snapshot.chantiers.find((item) => item.id === chantierId);
    if (!chantier) return;
    const days = Math.max(
      0,
      ...phasePatches.map((patch) => {
        const phase = snapshot.phases.find((item) => item.id === patch.id)!;
        return Math.abs(
          patch.date_debut && patch.date_debut > phase.date_debut!
            ? workingDaysBetween(phase.date_debut!, patch.date_debut)
            : workingDaysBetween(patch.date_debut ?? phase.date_debut!, phase.date_debut!),
        );
      }),
    );
    displacements.push({
      chantier_id: chantierId,
      nom_client: chantier.nom_client,
      priorite: chantier.priorite,
      working_days: days,
      phases: phasePatches.map((patch) => {
        const phase = snapshot.phases.find((item) => item.id === patch.id)!;
        return {
          phase_id: phase.id,
          type_phase: phase.type_phase,
          old_debut: phase.date_debut!,
          old_fin: phase.date_fin!,
          date_debut: patch.date_debut!,
          date_fin: patch.date_fin!,
          employe_id: patch.employe_id,
        };
      }),
    });
  });
  return displacements;
}

function remainingOfChantier(
  snapshot: PlanningSnapshot,
  origin: PhasePlanning,
): PhasePlanning[] {
  const chantier = chantierOf(snapshot, origin);
  if (!chantier) return [];
  return snapshot.phases.filter((phase) => {
    if (phase.statut === "termine") return false;
    return chantierOf(snapshot, phase)?.id === chantier.id;
  });
}

function shiftChantierRemaining(
  snapshot: PlanningSnapshot,
  origin: PhasePlanning,
  direction: number,
  workingDays: number,
): PlanningSnapshot {
  const remaining = new Set(
    remainingOfChantier(snapshot, origin)
      .filter((phase) => phase.date_debut && phase.date_fin)
      .map((phase) => phase.id),
  );
  return {
    ...snapshot,
    phases: snapshot.phases.map((phase) => {
      if (!remaining.has(phase.id) || !phase.date_debut || !phase.date_fin) {
        return phase;
      }
      const debut = addWorkingDays(phase.date_debut, direction * workingDays);
      let fin = addWorkingDays(phase.date_fin, direction * workingDays);
      if (fin < debut) fin = debut;
      return { ...phase, date_debut: debut, date_fin: fin };
    }),
  };
}

function relocatableForScope(
  work: PlanningSnapshot,
  origin: PhasePlanning,
  scope: DelayScope,
): Set<string> {
  const relocatable = collectRelocatable(work, origin);
  for (const pose of linkedPosePhases(work, origin.id)) {
    if (pose.date_debut && pose.date_fin) relocatable.add(pose.id);
  }
  if (scope !== "chantier") return relocatable;
  for (const phase of remainingOfChantier(work, origin)) {
    if (phase.id !== origin.id && phase.date_debut && phase.date_fin) {
      relocatable.add(phase.id);
    }
  }
  return relocatable;
}

function attachLinkedPoseDelay(
  snapshot: PlanningSnapshot,
  origin: PhasePlanning,
  result: DelayPlanResult,
): DelayPlanResult {
  if (origin.type_phase !== "pose") return result;
  if (linkedPosePhases(snapshot, origin.id).length < 2) return result;
  const planned = result.patches.find((item) => item.id === origin.id);
  const debut =
    planned?.date_debut ?? result.chosenStart ?? origin.date_debut;
  const fin = planned?.date_fin ?? origin.date_fin;
  if (!debut) return result;
  const move = planLinkedPoseMove(
    snapshot,
    origin,
    origin.employe_id ?? "",
    debut,
    fin,
  );
  if (!move) return result;
  if (move.blocked) {
    return {
      ...result,
      status: "conflict",
      message: move.message,
    };
  }
  const ids = new Set(move.patches.map((item) => item.id));
  return {
    ...result,
    patches: [
      ...result.patches.filter((item) => !ids.has(item.id)),
      ...move.patches,
    ],
    chosenStart: move.date_debut,
    message:
      result.status === "conflict"
        ? result.message
        : `${result.message} ${move.message}`,
  };
}

function prioritaireDatesMoved(
  snapshot: PlanningSnapshot,
  patches: PhasePatch[],
): boolean {
  return patches.some((patch) => {
    const phase = snapshot.phases.find((item) => item.id === patch.id);
    if (!phase) return false;
    return chantierOf(snapshot, phase)?.priorite === "prioritaire";
  });
}

export function delayTouchesPrioritaire(
  snapshot: PlanningSnapshot,
  patches: PhasePatch[],
): boolean {
  return prioritaireDatesMoved(snapshot, patches);
}

function resultFromPacked(
  snapshot: PlanningSnapshot,
  origin: PhasePlanning,
  packed: { dates: Map<string, Dated>; blocked: boolean },
  extras?: { chosenStart?: string; messageOk?: string },
): DelayPlanResult {
  const patches: PhasePatch[] = [];
  for (const phase of datedPhases(snapshot)) {
    const next = packed.dates.get(phase.id);
    if (!next) continue;
    if (next.debut === phase.date_debut && next.fin === phase.date_fin) continue;
    patches.push({
      id: phase.id,
      date_debut: next.debut,
      date_fin: next.fin,
      employe_id: phase.employe_id,
    });
  }
  const displacements = buildDisplacements(snapshot, origin, patches);
  const originPriorite = chantierOf(snapshot, origin)?.priorite ?? "normal";
  const originChantierId = chantierOf(snapshot, origin)?.id;
  const conflict =
    packed.blocked ||
    prioritaireDatesMoved(snapshot, patches) ||
    displacements.some((item) => {
      if (item.chantier_id === originChantierId) return false;
      if (!canCascadeDisplace(item.priorite, originPriorite)) return true;
      const chantier = snapshot.chantiers.find((row) => row.id === item.chantier_id);
      if (!chantier) return true;
      return item.working_days > chantierToleranceWorkingDays(chantier);
    });
  const originNext = packed.dates.get(origin.id);
  return {
    status: conflict ? "conflict" : "ok",
    patches,
    displacements,
    chosenStart: extras?.chosenStart ?? originNext?.debut,
    message: conflict
      ? "Ce décalage toucherait un chantier prioritaire. Validez l’arbitrage, ou annulez."
      : extras?.messageOk ??
        `${patches.length} phase(s) décalée(s) au minimum (aval bloqué seulement).`,
  };
}

function planMoveOriginStart(
  snapshot: PlanningSnapshot,
  origin: PhasePlanning,
  start: string,
  scope: DelayScope,
): DelayPlanResult {
  const workingDays = shiftToReach(origin.date_debut!, start);
  let work = snapshot;
  let originForPack = origin;
  let originDates: Dated;

  if (scope === "chantier") {
    work = shiftChantierRemaining(
      snapshot,
      origin,
      workingDays >= 0 ? 1 : -1,
      Math.abs(workingDays),
    );
    originForPack = work.phases.find((item) => item.id === origin.id) ?? origin;
    originDates = {
      debut: originForPack.date_debut!,
      fin: originForPack.date_fin!,
    };
  } else {
    originDates = placePhase(snapshot, origin, start);
  }

  const packed = packCascade(
    work,
    originForPack,
    originDates,
    relocatableForScope(work, originForPack, scope),
    workingDays < 0 ? -1 : 1,
    Math.abs(workingDays),
  );
  return attachLinkedPoseDelay(
    snapshot,
    origin,
    resultFromPacked(snapshot, origin, packed, {
      chosenStart: packed.dates.get(origin.id)?.debut,
    }),
  );
}

function scoreDelayPlan(
  snapshot: PlanningSnapshot,
  origin: PhasePlanning,
  result: DelayPlanResult,
  target: string,
): number {
  const byId = new Map(result.patches.map((patch) => [patch.id, patch]));
  const originStart =
    byId.get(origin.id)?.date_debut ?? origin.date_debut ?? target;
  const originEnd = byId.get(origin.id)?.date_fin ?? origin.date_fin ?? originStart;
  const distance = Math.abs(shiftToReach(target, originStart));
  const otherDays = result.displacements.reduce(
    (sum, item) => sum + item.working_days,
    0,
  );
  const otherPatches = result.patches.filter((item) => item.id !== origin.id).length;
  const conflict = result.status === "conflict" ? 1 : 0;
  const originRow = rowIdForPhase(origin.type_phase, origin.employe_id);
  let overlap = 0;
  if (originRow) {
    for (const phase of datedPhases(snapshot)) {
      if (phase.id === origin.id) continue;
      const row = rowIdForPhase(phase.type_phase, phase.employe_id);
      if (row !== originRow) continue;
      const debut = byId.get(phase.id)?.date_debut ?? phase.date_debut!;
      const fin = byId.get(phase.id)?.date_fin ?? phase.date_fin!;
      if (datesOverlap(originStart, originEnd, debut, fin)) overlap += 1;
    }
  }
  return (
    conflict * 1_000_000 +
    overlap * 5_000 +
    otherDays * 100 +
    otherPatches * 10 +
    distance
  );
}

function workingDaysAround(target: string, flex: number): string[] {
  const lo = addWorkingDays(target, -Math.max(0, flex));
  const hi = addWorkingDays(target, Math.max(0, flex));
  const days: string[] = [];
  let cursor = lo <= hi ? lo : hi;
  const end = lo <= hi ? hi : lo;
  while (cursor <= end) {
    if (!isWeekend(cursor)) days.push(cursor);
    cursor = addDays(cursor, 1);
  }
  return days;
}

export function planBestDelayInWindow(
  snapshot: PlanningSnapshot,
  phaseId: string,
  target: string,
  flexWorkingDays: number,
  options?: { scope?: DelayScope },
): DelayPlanResult {
  const origin = snapshot.phases.find((item) => item.id === phaseId);
  if (!origin || !origin.date_debut || !origin.date_fin) {
    return {
      status: "ok",
      patches: [],
      displacements: [],
      message: "Aucun décalage à appliquer.",
    };
  }

  const scope = options?.scope ?? "dependances";
  const window = workingDaysAround(target, flexWorkingDays);
  if (window.length === 0) {
    return {
      status: "ok",
      patches: [],
      displacements: [],
      message: "Aucune date ouvrée dans la fourchette.",
    };
  }
  const lo = window[0];
  const hi = window[window.length - 1];

  let best: DelayPlanResult | null = null;
  let bestScore = Number.POSITIVE_INFINITY;

  for (const start of window) {
    const result = planMoveOriginStart(snapshot, origin, start, scope);
    const placed = result.chosenStart ?? start;
    if (placed < lo || placed > hi) continue;
    const score = scoreDelayPlan(snapshot, origin, result, target);
    if (
      !best ||
      score < bestScore ||
      (score === bestScore && (placed < (best.chosenStart ?? placed) || start < (best.chosenStart ?? start)))
    ) {
      best = result;
      bestScore = score;
    }
  }

  if (!best) {
    return {
      status: "ok",
      patches: [],
      displacements: [],
      message: "Aucun créneau libre dans la fourchette (absences ou jours bloqués).",
    };
  }

  const chosen = best.chosenStart ?? target;
  return {
    ...best,
    message:
      best.status === "conflict"
        ? best.message
        : `Meilleur placement le ${chosen} (cible ${target} ±${flexWorkingDays} j. ouvré${flexWorkingDays > 1 ? "s" : ""}). ${best.patches.length} phase(s) ajustée(s).`,
  };
}

export function planDelayCascade(
  snapshot: PlanningSnapshot,
  phaseId: string,
  halfDays: number,
  options?: { scope?: DelayScope },
): DelayPlanResult {
  const origin = snapshot.phases.find((item) => item.id === phaseId);
  if (!origin || !origin.date_debut || !origin.date_fin || halfDays === 0) {
    return {
      status: "ok",
      patches: [],
      displacements: [],
      message: "Aucun décalage à appliquer.",
    };
  }

  const direction = halfDays < 0 ? -1 : 1;
  const workingDays = delayToWorkingDays(halfDays);
  const scope = options?.scope ?? "dependances";

  let work = snapshot;
  let originDates: Dated;
  let originForPack = origin;

  if (scope === "chantier") {
    work = shiftChantierRemaining(snapshot, origin, direction, workingDays);
    originForPack = work.phases.find((item) => item.id === phaseId) ?? origin;
    originDates = {
      debut: originForPack.date_debut!,
      fin: originForPack.date_fin!,
    };
  } else if (direction < 0) {
    originDates = advanceOriginDates(snapshot, origin, workingDays);
  } else {
    let originFin = addWorkingDays(origin.date_fin, workingDays);
    if (originFin < origin.date_debut) originFin = origin.date_debut;
    originDates = { debut: origin.date_debut, fin: originFin };
  }

  const packed = packCascade(
    work,
    originForPack,
    originDates,
    relocatableForScope(work, originForPack, scope),
    direction,
    workingDays,
  );
  const result = attachLinkedPoseDelay(
    snapshot,
    origin,
    resultFromPacked(snapshot, origin, packed),
  );
  if (result.status === "ok") {
    return {
      ...result,
      message:
        direction < 0
          ? `${result.patches.length} phase(s) rapprochée(s) (avance, délai logistique 10–11 j. respecté).`
          : `${result.patches.length} phase(s) décalée(s) au minimum (décalage, aval bloqué seulement).`,
    };
  }
  return result;
}

export function planDelayPatches(
  snapshot: PlanningSnapshot,
  phaseId: string,
  halfDays: number,
): PhasePatch[] {
  return planDelayCascade(snapshot, phaseId, halfDays).patches;
}

export function planAbsenceCascade(
  snapshot: PlanningSnapshot,
  phaseId: string,
  pendingAbsence: {
    employe_id: string;
    date_debut: string;
    date_fin: string;
    type: PlanningSnapshot["absences"][number]["type"];
  },
  options?: { ignoreAbsenceId?: string },
): DelayPlanResult {
  const origin = snapshot.phases.find((item) => item.id === phaseId);
  if (!origin || !origin.date_debut || !origin.date_fin) {
    return {
      status: "ok",
      patches: [],
      displacements: [],
      message: "Aucun décalage à appliquer.",
    };
  }

  const withAbsence: PlanningSnapshot = {
    ...snapshot,
    absences: [
      ...snapshot.absences.filter(
        (item) => item.id !== options?.ignoreAbsenceId,
      ),
      {
        id: "pending-absence",
        employe_id: pendingAbsence.employe_id,
        date_debut: pendingAbsence.date_debut,
        date_fin: pendingAbsence.date_fin,
        type: pendingAbsence.type,
      },
    ],
  };

  const placed = placePhase(withAbsence, origin, origin.date_debut);
  const relocatable = collectRelocatable(withAbsence, origin);
  const packed = packCascade(withAbsence, origin, placed, relocatable);

  const patches: PhasePatch[] = [];
  for (const phase of datedPhases(withAbsence)) {
    const next = packed.dates.get(phase.id);
    if (!next) continue;
    if (next.debut === phase.date_debut && next.fin === phase.date_fin) continue;
    patches.push({
      id: phase.id,
      date_debut: next.debut,
      date_fin: next.fin,
      employe_id: phase.employe_id,
    });
  }

  const displacements = buildDisplacements(withAbsence, origin, patches);
  const conflict =
    packed.blocked ||
    prioritaireDatesMoved(withAbsence, patches) ||
    displacements.some(
      (item) =>
        !canCascadeDisplace(
          item.priorite,
          chantierOf(withAbsence, origin)?.priorite ?? "normal",
        ),
    );

  return {
    status: conflict ? "conflict" : "ok",
    patches,
    displacements,
    message: conflict
      ? "Ce décalage toucherait un chantier prioritaire. Validez l’arbitrage, ou annulez."
      : `${patches.length} phase(s) recollées en cascade, hors jours d’absence.`,
  };
}

function delaySelfCheckSnapshot(): PlanningSnapshot {
  const employee = (
    id: string,
    nom: string,
  ): PlanningSnapshot["employees"][number] => ({
    id,
    nom,
    roles: ["fabrication", "pose"],
    actif: true,
  });
  const chantier = (
    id: string,
    nom_client: string,
  ): PlanningSnapshot["chantiers"][number] => ({
    id,
    nom_client,
    adresse: "",
    lien_dossier_onedrive: null,
    priorite: "normal",
    date_creation: "2026-09-01",
  });
  const phase = (
    id: string,
    element_id: string,
    type_phase: PhasePlanning["type_phase"],
    debut: string,
    fin: string,
    employe_id: string | null,
  ): PhasePlanning => ({
    id,
    element_id,
    type_phase,
    duree_estimee_heures: 8,
    date_debut: debut,
    date_fin: fin,
    employe_id,
    statut: "a_faire",
    urgent: false,
  });
  return {
    employees: [employee("alexis", "Alexis"), employee("romain", "Romain")],
    chantiers: [
      chantier("alpha", "Alpha"),
      chantier("beta", "Beta"),
      chantier("gamma", "Gamma"),
    ],
    elements: [
      { id: "el-a", chantier_id: "alpha", nom_element: "Table" },
      { id: "el-b", chantier_id: "alpha", nom_element: "Pergola" },
      { id: "el-c", chantier_id: "gamma", nom_element: "Portail" },
    ],
    phases: [
      phase("admin-a", "el-a", "administratif", "2026-09-08", "2026-09-08", "alexis"),
      phase("fab-a", "el-a", "fabrication", "2026-09-14", "2026-09-14", "alexis"),
      phase("log-a", "el-a", "logistique", "2026-09-15", "2026-09-16", null),
      phase("pose-a", "el-a", "pose", "2026-10-05", "2026-10-05", "alexis"),
      phase("fab-b", "el-b", "fabrication", "2026-09-22", "2026-09-23", "alexis"),
      phase("fab-c", "el-c", "fabrication", "2026-09-15", "2026-09-16", "romain"),
      phase("log-c", "el-c", "logistique", "2026-09-15", "2026-09-16", null),
      phase("pose-c", "el-c", "pose", "2026-10-06", "2026-10-06", "romain"),
    ],
    absences: [],
    signalements: [],
    receptions: [],
    demandes: [],
    horaires: [],
  };
}

function runDelayCascadeSelfCheck() {
  const snapshot = delaySelfCheckSnapshot();
  const gap = planDelayCascade(snapshot, "fab-a", 1);
  const ids = new Set(gap.patches.map((item) => item.id));
  if (!ids.has("fab-a")) {
    throw new Error("delay-cascade: la phase en retard doit être dans la proposition");
  }
  if (ids.has("fab-b") || ids.has("fab-c") || ids.has("pose-a")) {
    throw new Error(
      "delay-cascade: un demi-jour ne doit pas décaler un autre élément, un autre salarié, ni une pose déjà hors délai logistique",
    );
  }
  if (ids.has("log-c") || ids.has("pose-c")) {
    throw new Error(
      "delay-cascade: la file thermolaquage partagée ne doit pas sérialiser les autres chantiers",
    );
  }
  const movedLogA = gap.patches.find((item) => item.id === "log-a");
  if (!movedLogA?.date_debut || movedLogA.date_debut <= "2026-09-15") {
    throw new Error(
      "delay-cascade: la logistique du même élément doit suivre la fab si elle collait juste derrière",
    );
  }
  const origin = gap.patches.find((item) => item.id === "fab-a");
  if (origin?.date_fin !== "2026-09-15") {
    throw new Error(
      `delay-cascade: fin attendue 2026-09-15, reçu ${origin?.date_fin ?? "vide"}`,
    );
  }

  const tight: PlanningSnapshot = {
    ...snapshot,
    phases: snapshot.phases.map((item) =>
      item.id === "fab-b"
        ? { ...item, date_debut: "2026-09-15", date_fin: "2026-09-15" }
        : item,
    ),
  };
  const bumped = planDelayCascade(tight, "fab-a", 1);
  const movedB = bumped.patches.find((item) => item.id === "fab-b");
  if (!movedB?.date_debut || movedB.date_debut <= "2026-09-15") {
    throw new Error(
      "delay-cascade: la phase suivante du même salarié, en chevauchement, doit avancer d’un cran",
    );
  }
  if (bumped.patches.some((item) => item.id === "fab-c")) {
    throw new Error("delay-cascade: le salarié non concerné ne doit pas bouger");
  }

  const adminDelay = planDelayCascade(snapshot, "admin-a", 1);
  const adminIds = Array.from(
    new Set(adminDelay.patches.map((item) => item.id)),
  );
  if (adminIds.some((id) => id !== "admin-a")) {
    throw new Error(
      `delay-cascade: un retard admin sans chevauchement ni fab bougée ne doit pas entraîner la file aval (${adminIds.join(", ")})`,
    );
  }
  if (!adminIds.includes("admin-a")) {
    throw new Error("delay-cascade: la phase admin en retard doit être dans la proposition");
  }

  const advance = planDelayCascade(snapshot, "fab-a", -1);
  const advanceIds = new Set(advance.patches.map((item) => item.id));
  const advancedFab = advance.patches.find((item) => item.id === "fab-a");
  if (!advancedFab?.date_debut || advancedFab.date_debut >= "2026-09-14") {
    throw new Error(
      `delay-cascade: une avance doit rapprocher la phase, reçu ${advancedFab?.date_debut ?? "vide"}`,
    );
  }
  if (advanceIds.has("fab-c") || advanceIds.has("log-c") || advanceIds.has("pose-c")) {
    throw new Error("delay-cascade: une avance ne doit pas pousser les autres chantiers plus tard");
  }
  const advancedLog = advance.patches.find((item) => item.id === "log-a");
  if (advancedLog && advancedLog.date_debut && advancedLog.date_debut > "2026-09-15") {
    throw new Error("delay-cascade: une avance ne doit pas reculer la logistique du même élément");
  }
  const advancedPose = advance.patches.find((item) => item.id === "pose-a");
  if (advancedPose?.date_debut && advancedPose.date_debut > "2026-10-05") {
    throw new Error("delay-cascade: une avance ne doit pas reculer la pose");
  }
  if (advancedPose?.date_debut && advancedPose.date_debut < "2026-09-25") {
    throw new Error(
      "delay-cascade: une avance ne doit pas casser le délai logistique incompressible",
    );
  }
}

runDelayCascadeSelfCheck();


