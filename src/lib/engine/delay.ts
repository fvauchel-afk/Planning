import { addDays, addWorkingDays, datesOverlap, isWeekend, shiftToReach, workingDaysBetween } from "@/lib/dates";
import { canPriorityDisplace, chantierToleranceWorkingDays } from "@/lib/priorite";
import {
  TYPES_PHASE,
  type Chantier,
  type PhasePatch,
  type PhasePlanning,
  type PlanningSnapshot,
  type Priorite,
  type TypePhase,
} from "@/lib/types";
import type { Displacement } from "./planner";
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
  const originRow = rowIdForPhase(origin.type_phase, origin.employe_id);
  const all = datedPhases(snapshot);

  for (const phase of all) {
    if (phase.id === origin.id || phase.statut === "termine") continue;
    const rowId = rowIdForPhase(phase.type_phase, phase.employe_id);
    if (originRow && rowId === originRow && originalOrder(phase, origin) > 0) {
      relocatable.add(phase.id);
    }
    if (laterType(phase, origin)) relocatable.add(phase.id);
  }

  let added = true;
  while (added) {
    added = false;
    for (const current of all) {
      if (!relocatable.has(current.id)) continue;
      const currentRow = rowIdForPhase(current.type_phase, current.employe_id);
      for (const phase of all) {
        if (phase.id === origin.id || phase.statut === "termine") continue;
        if (relocatable.has(phase.id)) continue;
        if (laterType(phase, current)) {
          relocatable.add(phase.id);
          added = true;
          continue;
        }
        const rowId = rowIdForPhase(phase.type_phase, phase.employe_id);
        if (
          currentRow &&
          rowId === currentRow &&
          originalOrder(phase, current) > 0
        ) {
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

function packCascade(
  snapshot: PlanningSnapshot,
  origin: PhasePlanning,
  originDates: Dated,
  relocatable: Set<string>,
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
        const prev = i === 0 ? null : dates.get(list[i - 1].id);
        let start: string | null = prev
          ? nextOpenDay(snapshot, rowId, prev.fin)
          : null;
        const logistics = minStartForPhase(snapshot, phase, dates, rowId);
        if (logistics) {
          start = start ? maxDate(start, logistics) : logistics;
        }
        if (!start) start = phase.date_debut!;
        const placed = placePhase(snapshot, phase, start);
        const current = dates.get(phase.id)!;
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
  if (scope !== "chantier") return relocatable;
  for (const phase of remainingOfChantier(work, origin)) {
    if (phase.id !== origin.id && phase.date_debut && phase.date_fin) {
      relocatable.add(phase.id);
    }
  }
  return relocatable;
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
        `${patches.length} phase(s) recollées en cascade, sans trou évitable.`,
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
  );
  return resultFromPacked(snapshot, origin, packed, {
    chosenStart: packed.dates.get(origin.id)?.debut,
  });
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
  } else {
    let originFin = addWorkingDays(origin.date_fin, direction * workingDays);
    if (originFin < origin.date_debut) originFin = origin.date_debut;
    originDates = { debut: origin.date_debut, fin: originFin };
  }

  const packed = packCascade(
    work,
    originForPack,
    originDates,
    relocatableForScope(work, originForPack, scope),
  );
  const result = resultFromPacked(snapshot, origin, packed);
  if (result.status === "ok") {
    const verb = direction < 0 ? "avancée" : "décalage";
    return {
      ...result,
      message: `${result.patches.length} phase(s) recollées en cascade (${verb}), sans trou évitable.`,
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

