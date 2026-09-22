import { employeeCanTakePhase } from "@/lib/chantier-status";
import { addDays, addWorkingDays, isSunday, isoWeekday, shiftToReach, workingDaysBetween } from "@/lib/dates";
import { compareEmployeesByOrdre } from "@/lib/display-order";
import { employeeAvailableOnRange, employeeWorksOnDate, hoursForSlot, horairesFromPreset, rangeEndFromHours } from "@/lib/engine/hours";
import {
  SEARCH_DAYS,
  buildOccupancy,
  freeRangesOnDate,
  isCompanyHoliday,
  isEmployeeAbsent,
  isSlotBlockedForRow,
  todayIso,
} from "@/lib/engine/slots";
import {
  PHASE_LABELS,
  type NewChantierInput,
  type NewElementInput,
  type PhaseInsert,
  type PhasePatch,
  type PlanningSnapshot,
  type TypePhase,
} from "@/lib/types";

export const DEFAULT_LAQUAGE_WORKING_DAYS = 5;

const PHASE_ORDER: TypePhase[] = [
  "administratif",
  "fabrication",
  "logistique",
  "livraison",
  "pose",
];

export function earliestAvailableWorkDate(
  snapshot: PlanningSnapshot,
  fromDate = todayIso(),
): string {
  const occupancy = buildOccupancy(snapshot);
  const employees = snapshot.employees.filter((employee) => employee.actif);
  for (let i = 0; i < SEARCH_DAYS; i += 1) {
    const date = addDays(fromDate, i);
    if (isSunday(date) || isCompanyHoliday(snapshot, date)) continue;
    if (employees.length === 0) {
      if (isoWeekday(date) === 6) continue;
      return date;
    }
    const someoneFree = employees.some((employee) => {
      if (!employeeWorksOnDate(snapshot, employee, date)) return false;
      if (isEmployeeAbsent(snapshot, employee.id, date)) return false;
      const hasHours =
        hoursForSlot(snapshot, employee.id, date, 0) > 0 ||
        hoursForSlot(snapshot, employee.id, date, 1) > 0;
      if (!hasHours) return false;
      return freeRangesOnDate(occupancy, snapshot, employee.id, date).length > 0;
    });
    if (someoneFree) return date;
  }
  let fallback = fromDate;
  for (let i = 0; i < 14; i += 1) {
    if (!isSunday(fallback) && isoWeekday(fallback) !== 6) return fallback;
    fallback = addDays(fallback, 1);
  }
  return fromDate;
}

function clampDelay(raw: number | null | undefined): number {
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) return DEFAULT_LAQUAGE_WORKING_DAYS;
  return Math.min(60, Math.round(value));
}

function nextWorkingDayAfter(date: string): string {
  return addWorkingDays(date, 1);
}

export function firstWorkingOnOrAfter(date: string): string {
  let cursor = date;
  for (let i = 0; i < 14; i += 1) {
    if (!isSunday(cursor) && isoWeekday(cursor) !== 6) return cursor;
    cursor = addDays(cursor, 1);
  }
  return date;
}

export function firstWorkingOnOrBefore(date: string): string {
  let cursor = date;
  for (let i = 0; i < 14; i += 1) {
    if (!isSunday(cursor) && isoWeekday(cursor) !== 6) return cursor;
    cursor = addDays(cursor, -1);
  }
  return date;
}

function rangeEnd(start: string, workingDays: number): string {
  if (workingDays <= 1) return start;
  return addWorkingDays(start, workingDays - 1);
}

function inclusiveWorkingDays(start: string, end: string): number {
  if (end <= start) return 1;
  return 1 + workingDaysBetween(start, end);
}

type PhaseInput = NewElementInput["phases"][number];

function phaseOf(phases: PhaseInput[], type: PhaseInput["type_phase"]): PhaseInput | undefined {
  return phases.find((phase) => phase.type_phase === type);
}

const ASSIGN_REQUIRED: TypePhase[] = ["fabrication", "pose", "livraison"];

export function pickEmployeeForPhase(
  snapshot: PlanningSnapshot,
  type: TypePhase,
  debut: string | null,
  fin: string | null,
  preferredId?: string | null,
  excludeIds?: Iterable<string>,
): string | null {
  if (type === "logistique") return null;
  const excluded = new Set(excludeIds);
  const preferred = snapshot.employees.find((item) => item.id === preferredId);
  if (
    preferred &&
    !excluded.has(preferred.id) &&
    employeeCanTakePhase(preferred, type) &&
    employeeAvailableOnRange(snapshot, preferred, debut, fin)
  ) {
    return preferred.id;
  }
  const available = snapshot.employees
    .filter(
      (employee) =>
        !excluded.has(employee.id) &&
        employeeCanTakePhase(employee, type) &&
        employeeAvailableOnRange(snapshot, employee, debut, fin),
    )
    .sort(compareEmployeesByOrdre);
  if (available[0]) return available[0].id;
  if (
    preferred &&
    !excluded.has(preferred.id) &&
    employeeCanTakePhase(preferred, type)
  ) {
    return preferred.id;
  }
  const withRole = snapshot.employees
    .filter(
      (employee) =>
        !excluded.has(employee.id) && employeeCanTakePhase(employee, type),
    )
    .sort(compareEmployeesByOrdre);
  return withRole[0]?.id ?? null;
}

/** Combien de poseurs auto à ajouter en plus de la 1re phase pose (déjà remplie). */
export function extraAutoPoseurCount(
  namedCount: number,
  extraAuto: number,
): number {
  const extra = Math.max(0, Math.min(2, Math.floor(extraAuto) || 0));
  if (namedCount <= 0) return Math.max(0, extra - 1);
  return extra;
}

export function pickDistinctEmployeesForPhase(
  snapshot: PlanningSnapshot,
  type: TypePhase,
  debut: string | null,
  fin: string | null,
  count: number,
  excludeIds?: Iterable<string>,
): string[] {
  const taken = new Set(excludeIds);
  const ids: string[] = [];
  const want = Math.max(0, count);
  for (let i = 0; i < want; i += 1) {
    const id = pickEmployeeForPhase(snapshot, type, debut, fin, null, taken);
    if (!id) break;
    ids.push(id);
    taken.add(id);
  }
  return ids;
}

export function missingRequiredAssignee(
  input: NewChantierInput,
): string | null {
  for (const element of input.elements) {
    for (const phase of element.phases) {
      if (!ASSIGN_REQUIRED.includes(phase.type_phase)) continue;
      if (!phase.date_debut) continue;
      if (phase.type_phase === "pose" && !input.avec_pose) continue;
      if (phase.type_phase === "fabrication" && input.avec_fabrication === false) {
        continue;
      }
      if (phase.type_phase === "livraison" && !input.avec_livraison) continue;
      if (phase.employe_id) continue;
      return `Aucun salarié n’a pu être assigné à ${PHASE_LABELS[phase.type_phase]} (${element.nom_element}). Donnez le rôle ${PHASE_LABELS[phase.type_phase]} à quelqu’un dans Employés, ou choisissez une personne dans le formulaire.`;
    }
  }
  return null;
}

export function missingGridAssignee(
  snapshot: PlanningSnapshot,
  chantierId: string,
): string | null {
  const elementIds = new Set(
    snapshot.elements
      .filter((element) => element.chantier_id === chantierId)
      .map((element) => element.id),
  );
  for (const phase of snapshot.phases) {
    if (!elementIds.has(phase.element_id)) continue;
    if (!ASSIGN_REQUIRED.includes(phase.type_phase)) continue;
    if (!phase.date_debut) continue;
    if (phase.employe_id) continue;
    return `Aucun salarié n’a pu être assigné à ${PHASE_LABELS[phase.type_phase]}. Choisissez un salarié dans Modifier le chantier, ou donnez ce rôle à quelqu’un dans Employés.`;
  }
  return null;
}

function laterDate(left: string, right: string): string {
  return left >= right ? left : right;
}

/**
 * Cale toute la chaîne (Administratif → Fabrication → Thermolaquage → Livraison → Pose)
 * dès la création, même si un délai (ex. 5 j. de laquage) ne sera officiel qu’au bon de commande.
 * Les phases qui attendent cet événement portent le badge estimatif.
 */
export function applyPhaseChainOnCreate(
  snapshot: PlanningSnapshot,
  input: NewChantierInput,
): NewChantierInput {
  const thermo = Boolean(input.avec_thermolaquage);
  const pose = Boolean(input.avec_pose);
  const fabrication = input.avec_fabrication !== false;
  const livraison = Boolean(input.avec_livraison);
  const delayDays = clampDelay(input.delai_laquage_jours);
  const laquageDebut = input.date_laquage_debut || null;
  const laquageFin = input.date_laquage_fin || null;
  const chainStart =
    input.date_debut || earliestAvailableWorkDate(snapshot);

  const chained: NewChantierInput = {
    ...input,
    elements: input.elements.map((element) => {
      const phases = element.phases.map((phase) => ({ ...phase }));
      let prevEnd: string | null = null;

      for (const type of PHASE_ORDER) {
        const current = phaseOf(phases, type);
        if (!current) continue;

        const skipPose = type === "pose" && !pose;
        const skipFab = type === "fabrication" && !fabrication;
        const skipThermo = type === "logistique" && !thermo;
        const skipLivraison = type === "livraison" && !livraison;
        const hours = Number(current.duree_estimee_heures) || 0;
        if (type === "fabrication" && fabrication && hours <= 0) {
          current.duree_estimee_heures = 8;
        }
        if (type === "pose" && pose && hours <= 0) {
          current.duree_estimee_heures = 8;
        }
        const plannedHours = Number(current.duree_estimee_heures) || 0;
        const skipEmpty =
          type !== "logistique" &&
          !(type === "fabrication" && fabrication) &&
          plannedHours <= 0 &&
          !(type === "pose" && pose) &&
          !(type === "livraison" && livraison);
        const waitingOnBonCommande = Boolean(thermo);

        if (skipPose || skipFab || skipThermo || skipLivraison || skipEmpty) {
          if (skipPose || skipFab || skipThermo || skipLivraison) {
            current.date_debut = null;
            current.date_fin = null;
            if (skipThermo || skipPose || skipFab || skipLivraison) {
              current.duree_estimee_heures = 0;
            }
            if (skipThermo || skipFab) current.employe_id = null;
          }
          continue;
        }

        const minStart: string = prevEnd
          ? nextWorkingDayAfter(prevEnd)
          : chainStart;

        let start = minStart;
        if (type === "logistique") {
          const requested = current.date_debut || laquageDebut;
          if (requested) start = laterDate(minStart, requested);
        } else if (current.date_debut) {
          start = laterDate(minStart, current.date_debut);
        }

        if (type === "livraison" && plannedHours <= 0) {
          current.duree_estimee_heures = 2;
        }
        let end: string;
        if (type === "logistique") {
          end = rangeEnd(start, delayDays);
          if (laquageFin && laquageFin >= start) {
            end = laterDate(end, laquageFin);
          }
          current.employe_id = null;
          if (!hours) {
            current.duree_estimee_heures =
              inclusiveWorkingDays(start, end) * 8;
          }
        } else {
          current.employe_id = pickEmployeeForPhase(
            snapshot,
            type,
            start,
            start,
            current.employe_id,
          );
          const hoursForRange =
            type === "livraison" && plannedHours <= 0 ? 2 : plannedHours;
          end = rangeEndFromHours(
            snapshot,
            current.employe_id,
            start,
            hoursForRange,
          );
          if (current.date_fin && current.date_fin >= start) {
            end = laterDate(end, current.date_fin);
          }
        }

        current.date_debut = start;
        current.date_fin = end < start ? start : end;
        if (
          waitingOnBonCommande &&
          (type === "logistique" || type === "livraison" || type === "pose")
        ) {
          current.dates_estimatives = true;
        }
        prevEnd = current.date_fin;
      }

      return { ...element, phases };
    }),
  };
  return packChainAgainstDeadline(chained);
}

function packChainAgainstDeadline(input: NewChantierInput): NewChantierInput {
  const deadline = input.date_fin?.slice(0, 10) || null;
  if (!deadline) return input;
  const target = firstWorkingOnOrBefore(deadline);
  let lastEnd: string | null = null;
  for (const element of input.elements) {
    for (const phase of element.phases) {
      const end = phase.date_fin?.slice(0, 10) || null;
      if (end && (!lastEnd || end > lastEnd)) lastEnd = end;
    }
  }
  if (!lastEnd) return input;
  const shift = shiftToReach(lastEnd, target);
  if (shift === 0) return input;
  if (input.date_debut && lastEnd > target) return input;
  return {
    ...input,
    elements: input.elements.map((element) => ({
      ...element,
      phases: element.phases.map((phase) => {
        const debut = phase.date_debut?.slice(0, 10) || null;
        const fin = phase.date_fin?.slice(0, 10) || null;
        if (!debut && !fin) return phase;
        return {
          ...phase,
          date_debut: debut ? addWorkingDays(debut, shift) : null,
          date_fin: fin ? addWorkingDays(fin, shift) : null,
        };
      }),
    })),
  };
}

/**
 * Recale thermolaquage / galvanisation sur N jours ouvrés à partir de l’envoi du BC,
 * puis toutes les phases suivantes (livraison, pose). Ces dates deviennent confirmées.
 */
export function applyBonCommandeDelay(
  snapshot: PlanningSnapshot,
  chantierId: string,
  sendDate: string,
  delayDays = DEFAULT_LAQUAGE_WORKING_DAYS,
): { patches: PhasePatch[]; inserts: PhaseInsert[] } {
  const days = clampDelay(delayDays);
  const start = firstWorkingOnOrAfter(sendDate);
  const end = rangeEnd(start, days);
  const poseStart = nextWorkingDayAfter(end);
  const elementIds = snapshot.elements
    .filter((element) => element.chantier_id === chantierId)
    .map((element) => element.id);
  const patches: PhasePatch[] = [];
  const inserts: PhaseInsert[] = [];
  const byElement = new Map<string, typeof snapshot.phases>();
  for (const phase of snapshot.phases) {
    if (!elementIds.includes(phase.element_id)) continue;
    const list = byElement.get(phase.element_id) ?? [];
    list.push(phase);
    byElement.set(phase.element_id, list);
  }
  for (const elementId of elementIds) {
    const phases = byElement.get(elementId) ?? [];
    const logistique = phases.find((item) => item.type_phase === "logistique");
    const livraison = phases.find((item) => item.type_phase === "livraison");
    const pose = phases.find((item) => item.type_phase === "pose");
    if (!logistique) {
      inserts.push({
        element_id: elementId,
        type_phase: "logistique",
        duree_estimee_heures: days * 8,
        date_debut: start,
        date_fin: end,
        employe_id: null,
        statut: "a_faire",
        urgent: false,
        heures_supplementaires_par_jour: 0,
      });
    } else {
      patches.push({
        id: logistique.id,
        date_debut: start,
        date_fin: end,
        employe_id: null,
        heure_debut: null,
      });
    }
    let followingStart = poseStart;
    if (livraison && (livraison.duree_estimee_heures > 0 || livraison.date_debut)) {
      const livEnd = rangeEndFromHours(
        snapshot,
        livraison.employe_id,
        followingStart,
        Number(livraison.duree_estimee_heures) || 2,
      );
      patches.push({
        id: livraison.id,
        date_debut: followingStart,
        date_fin: livEnd,
        employe_id: livraison.employe_id,
        heure_debut: livraison.heure_debut ?? null,
      });
      followingStart = nextWorkingDayAfter(livEnd);
    }
    if (pose && (pose.duree_estimee_heures > 0 || pose.date_debut)) {
      const poseHours = Number(pose.duree_estimee_heures) || 8;
      patches.push({
        id: pose.id,
        date_debut: followingStart,
        date_fin: rangeEndFromHours(
          snapshot,
          pose.employe_id,
          followingStart,
          poseHours,
        ),
        employe_id: pose.employe_id,
        heure_debut: pose.heure_debut ?? null,
      });
    }
  }
  return { patches, inserts };
}

function phaseHasContent(
  phase: { date_debut: string | null; duree_estimee_heures: number },
): boolean {
  return Boolean(phase.date_debut) || Number(phase.duree_estimee_heures) > 0;
}

export function chantierPhaseOptions(
  snapshot: PlanningSnapshot,
  chantierId: string,
): { avecPose: boolean; avecThermolaquage: boolean; avecLivraison: boolean; avecFabrication: boolean } {
  const chantier = snapshot.chantiers.find((item) => item.id === chantierId);
  const elementIds = new Set(
    snapshot.elements
      .filter((element) => element.chantier_id === chantierId)
      .map((element) => element.id),
  );
  const phases = snapshot.phases.filter((phase) => elementIds.has(phase.element_id));
  return {
    avecFabrication: phases.some(
      (phase) => phase.type_phase === "fabrication" && phaseHasContent(phase),
    ),
    avecPose: phases.some(
      (phase) => phase.type_phase === "pose" && phaseHasContent(phase),
    ),
    avecThermolaquage:
      Boolean(chantier?.date_bon_commande) ||
      phases.some(
        (phase) => phase.type_phase === "logistique" && phaseHasContent(phase),
      ),
    avecLivraison: phases.some(
      (phase) => phase.type_phase === "livraison" && phaseHasContent(phase),
    ),
  };
}

function scheduleAfter(
  snapshot: PlanningSnapshot,
  afterDate: string | null,
  workingDays: number,
): { start: string; end: string } {
  const start = afterDate
    ? nextWorkingDayAfter(afterDate)
    : earliestAvailableWorkDate(snapshot);
  const aligned = firstWorkingOnOrAfter(start);
  return { start: aligned, end: rangeEnd(aligned, workingDays) };
}

function lastDatedEnd(
  phases: { type_phase: TypePhase; date_debut: string | null; date_fin: string | null }[],
  beforeType?: TypePhase,
): string | null {
  const limit = beforeType ? PHASE_ORDER.indexOf(beforeType) : PHASE_ORDER.length;
  let end: string | null = null;
  for (const type of PHASE_ORDER) {
    if (PHASE_ORDER.indexOf(type) >= limit) break;
    const phase = phases.find((item) => item.type_phase === type);
    const value = phase?.date_fin || phase?.date_debut || null;
    if (value) end = value;
  }
  return end;
}

function firstOpenDateOnOrAfter(
  snapshot: PlanningSnapshot,
  rowId: string,
  fromDate: string,
): string {
  let date = fromDate;
  for (let i = 0; i < SEARCH_DAYS; i += 1) {
    if (!isSlotBlockedForRow(snapshot, rowId, date)) return date;
    date = addDays(date, 1);
  }
  return date;
}

function scheduleHoursOnAssignee(
  snapshot: PlanningSnapshot,
  employeId: string | null,
  fromDate: string,
  hours: number,
): { start: string; end: string } {
  const needed = Math.max(hours, 0);
  if (!employeId) {
    const aligned = firstWorkingOnOrAfter(fromDate);
    return {
      start: aligned,
      end: rangeEndFromHours(snapshot, null, aligned, needed),
    };
  }
  const start = firstOpenDateOnOrAfter(snapshot, employeId, fromDate);
  return {
    start,
    end: rangeEndFromHours(snapshot, employeId, start, needed),
  };
}

type OptionEditOptions = {
  avecFabrication?: boolean;
  avecPose: boolean;
  avecThermolaquage: boolean;
  avecLivraison?: boolean;
  dureeLivraisonHeures?: number | null;
  employeLivraisonId?: string | null;
  employeFabricationId?: string | null;
  employePoseId?: string | null;
  delayDays?: number | null;
  datesEstimatives?: boolean;
};

function preferredAssigneeForType(
  type: TypePhase,
  options: OptionEditOptions,
): string | null | undefined {
  if (type === "fabrication") return options.employeFabricationId;
  if (type === "pose") return options.employePoseId;
  if (type === "livraison") return options.employeLivraisonId;
  return undefined;
}

function mergePhasePatch(
  patches: PhasePatch[],
  phase: {
    id: string;
    date_debut: string | null;
    date_fin: string | null;
    employe_id: string | null;
    heure_debut?: string | null;
    duree_estimee_heures: number;
  },
  extra: Partial<PhasePatch>,
) {
  const index = patches.findIndex((item) => item.id === phase.id);
  const current =
    index >= 0
      ? patches[index]!
      : {
          id: phase.id,
          date_debut: phase.date_debut,
          date_fin: phase.date_fin,
          employe_id: phase.employe_id,
          heure_debut: phase.heure_debut ?? null,
          duree_estimee_heures: phase.duree_estimee_heures,
        };
  const next = { ...current, ...extra };
  if (index >= 0) patches[index] = next;
  else patches.push(next);
}

function recaleElementChain(
  snapshot: PlanningSnapshot,
  elementId: string,
  fromType: TypePhase,
  delayDays: number,
  patches: PhasePatch[],
  inserts: PhaseInsert[],
  deleteIds: string[],
) {
  const deleted = new Set(deleteIds);
  const siblings = snapshot.phases.filter(
    (phase) => phase.element_id === elementId && !deleted.has(phase.id),
  );
  const resolved = (type: TypePhase) => {
    const phase = siblings.find((item) => item.type_phase === type);
    const insert = inserts.find(
      (item) => item.element_id === elementId && item.type_phase === type,
    );
    if (phase) {
      const patched = patches.find((item) => item.id === phase.id);
      return {
        kind: "phase" as const,
        phase,
        date_debut: patched?.date_debut ?? phase.date_debut,
        date_fin: patched?.date_fin ?? phase.date_fin,
        employe_id: patched?.employe_id ?? phase.employe_id,
        heure_debut: patched?.heure_debut ?? phase.heure_debut ?? null,
        duree_estimee_heures:
          patched?.duree_estimee_heures ?? phase.duree_estimee_heures,
      };
    }
    if (insert) {
      return {
        kind: "insert" as const,
        insert,
        date_debut: insert.date_debut,
        date_fin: insert.date_fin,
        employe_id: insert.employe_id,
        heure_debut: insert.heure_debut ?? null,
        duree_estimee_heures: insert.duree_estimee_heures,
      };
    }
    return null;
  };

  let prevEnd = lastDatedEnd(
    PHASE_ORDER.map((type) => {
      const item = resolved(type);
      return {
        type_phase: type,
        date_debut: item?.date_debut ?? null,
        date_fin: item?.date_fin ?? null,
      };
    }),
    fromType,
  );
  const fromIndex = PHASE_ORDER.indexOf(fromType);

  for (const type of PHASE_ORDER) {
    if (PHASE_ORDER.indexOf(type) < fromIndex) continue;
    const current = resolved(type);
    if (!current) continue;
    const debut = current.date_debut;
    const fin = current.date_fin ?? debut;
    if (!debut && Number(current.duree_estimee_heures) <= 0 && type !== "logistique") {
      continue;
    }
    const hours = Number(current.duree_estimee_heures) || 0;
    const afterPrev = prevEnd ? nextWorkingDayAfter(prevEnd) : null;
    const requested = debut || afterPrev;
    if (!requested && !afterPrev) continue;
    const minStart = afterPrev && requested ? laterDate(afterPrev, requested) : (afterPrev || requested)!;
    const range =
      type === "logistique"
        ? scheduleAfter(snapshot, prevEnd, delayDays)
        : scheduleHoursOnAssignee(
            snapshot,
            current.employe_id,
            minStart,
            type === "livraison" && hours <= 0 ? 2 : hours,
          );
    if (range.start !== debut || range.end !== fin) {
      if (current.kind === "phase") {
        mergePhasePatch(patches, current.phase, {
          date_debut: range.start,
          date_fin: range.end,
          employe_id: current.employe_id,
          heure_debut: current.heure_debut,
          duree_estimee_heures: current.duree_estimee_heures,
        });
      } else {
        current.insert.date_debut = range.start;
        current.insert.date_fin = range.end;
      }
    }
    prevEnd = range.end;
  }
}

export function planRecaleAfterAssignees(
  snapshot: PlanningSnapshot,
  chantierId: string,
  changedPhaseIds: Iterable<string>,
  delayDays?: number | null,
): { patches: PhasePatch[]; inserts: PhaseInsert[]; deleteIds: string[] } {
  const delay = clampDelay(delayDays);
  const patches: PhasePatch[] = [];
  const inserts: PhaseInsert[] = [];
  const deleteIds: string[] = [];
  const changed = new Set(changedPhaseIds);
  if (changed.size === 0) return { patches, inserts, deleteIds };
  const elements = snapshot.elements.filter(
    (element) => element.chantier_id === chantierId,
  );
  for (const element of elements) {
    const siblings = snapshot.phases.filter(
      (phase) => phase.element_id === element.id,
    );
    let fromType: TypePhase | null = null;
    for (const phase of siblings) {
      if (!changed.has(phase.id)) continue;
      if (
        !fromType ||
        PHASE_ORDER.indexOf(phase.type_phase) < PHASE_ORDER.indexOf(fromType)
      ) {
        fromType = phase.type_phase;
      }
    }
    if (fromType) {
      recaleElementChain(
        snapshot,
        element.id,
        fromType,
        delay,
        patches,
        inserts,
        deleteIds,
      );
    }
  }
  return { patches, inserts, deleteIds };
}

function cascadeAfterAssigneeChanges(
  snapshot: PlanningSnapshot,
  chantierId: string,
  options: OptionEditOptions,
  wantLivraison: boolean,
  patches: PhasePatch[],
  inserts: PhaseInsert[],
  deleteIds: string[],
) {
  const delayDays = clampDelay(options.delayDays);
  const deleted = new Set(deleteIds);
  const elements = snapshot.elements.filter(
    (element) => element.chantier_id === chantierId,
  );
  for (const element of elements) {
    const siblings = snapshot.phases.filter(
      (phase) => phase.element_id === element.id && !deleted.has(phase.id),
    );
    let fromType: TypePhase | null = null;
    for (const type of ASSIGN_REQUIRED) {
      if (type === "fabrication" && options.avecFabrication === false) continue;
      if (type === "pose" && !options.avecPose) continue;
      if (type === "livraison" && !wantLivraison) continue;
      const phase = siblings.find((item) => item.type_phase === type);
      const insert = inserts.find(
        (item) => item.element_id === element.id && item.type_phase === type,
      );
      const originalId = phase?.employe_id ?? insert?.employe_id ?? null;
      const preferred = preferredAssigneeForType(type, options);
      const changed = Boolean(preferred) && preferred !== originalId;
      const newlyDated =
        Boolean(phase) &&
        !phase!.date_debut &&
        Boolean(patches.find((item) => item.id === phase!.id)?.date_debut);
      if (!changed && !newlyDated) continue;
      if (
        !fromType ||
        PHASE_ORDER.indexOf(type) < PHASE_ORDER.indexOf(fromType)
      ) {
        fromType = type;
      }
    }
    if (fromType) {
      recaleElementChain(
        snapshot,
        element.id,
        fromType,
        delayDays,
        patches,
        inserts,
        deleteIds,
      );
    }
  }
}

function applyAssigneeEdits(
  snapshot: PlanningSnapshot,
  chantierId: string,
  options: OptionEditOptions,
  wantLivraison: boolean,
  patches: PhasePatch[],
  inserts: PhaseInsert[],
  deleteIds: string[],
) {
  const deleted = new Set(deleteIds);
  const elements = snapshot.elements.filter(
    (element) => element.chantier_id === chantierId,
  );

  for (const element of elements) {
    const siblings = snapshot.phases.filter(
      (phase) => phase.element_id === element.id && !deleted.has(phase.id),
    );
    let earliest: string | null = null;
    for (const phase of siblings) {
      const patched = patches.find((item) => item.id === phase.id);
      const start = patched?.date_debut ?? phase.date_debut;
      if (start && (!earliest || start < earliest)) earliest = start;
    }
    for (const insert of inserts) {
      if (insert.element_id !== element.id || !insert.date_debut) continue;
      if (!earliest || insert.date_debut < earliest) earliest = insert.date_debut;
    }
    const fallbackStart = earliest
      ? firstWorkingOnOrAfter(earliest)
      : earliestAvailableWorkDate(snapshot);

    const assignExisting = (
      type: "fabrication" | "pose" | "livraison",
      preferred: string | null | undefined,
      dateIfMissing: boolean,
    ) => {
      const phase = siblings.find((item) => item.type_phase === type);
      if (!phase) return;
      const patched = patches.find((item) => item.id === phase.id);
      let debut = patched?.date_debut ?? phase.date_debut;
      let fin = patched?.date_fin ?? phase.date_fin ?? debut;
      let hours = patched?.duree_estimee_heures ?? phase.duree_estimee_heures;
      const extra: Partial<PhasePatch> = {};
      if (!debut && dateIfMissing) {
        debut = fallbackStart;
        fin = fallbackStart;
        hours = Math.max(8, Number(hours) || 0);
        extra.date_debut = debut;
        extra.date_fin = fin;
        extra.duree_estimee_heures = hours;
        extra.heure_debut = phase.heure_debut ?? "07:30";
      }
      if (!debut) return;
      const currentId = patched?.employe_id ?? phase.employe_id;
      const employeId = pickEmployeeForPhase(
        snapshot,
        type,
        debut,
        fin || debut,
        preferred ?? currentId,
      );
      if (
        extra.date_debut ||
        (employeId && employeId !== currentId) ||
        (preferred && preferred !== currentId)
      ) {
        extra.employe_id = employeId ?? preferred ?? currentId;
        mergePhasePatch(patches, { ...phase, ...patched }, extra);
      }
    };

    assignExisting(
      "fabrication",
      options.employeFabricationId,
      options.avecFabrication !== false,
    );
    if (options.avecPose) {
      assignExisting("pose", options.employePoseId, true);
    }
    if (wantLivraison) {
      assignExisting("livraison", options.employeLivraisonId, false);
    }
  }

  for (const insert of inserts) {
    if (!ASSIGN_REQUIRED.includes(insert.type_phase)) continue;
    const preferred =
      insert.type_phase === "fabrication"
        ? options.employeFabricationId
        : insert.type_phase === "pose"
          ? options.employePoseId
          : options.employeLivraisonId;
    insert.employe_id = pickEmployeeForPhase(
      snapshot,
      insert.type_phase,
      insert.date_debut,
      insert.date_fin,
      preferred ?? insert.employe_id,
    );
  }

  cascadeAfterAssigneeChanges(
    snapshot,
    chantierId,
    options,
    wantLivraison,
    patches,
    inserts,
    deleteIds,
  );
}

/**
 * Ajoute ou retire Thermolaquage / Pose sur un chantier déjà créé.
 * Non → Oui cale la nouvelle phase après la précédente (fab, puis thermo, puis pose).
 */
export function planChantierOptionEdits(
  snapshot: PlanningSnapshot,
  chantierId: string,
  options: {
    avecFabrication?: boolean;
    avecPose: boolean;
    avecThermolaquage: boolean;
    avecLivraison?: boolean;
    dureeLivraisonHeures?: number | null;
    employeLivraisonId?: string | null;
    employeFabricationId?: string | null;
    employePoseId?: string | null;
    delayDays?: number | null;
    datesEstimatives?: boolean;
  },
): { patches: PhasePatch[]; inserts: PhaseInsert[]; deleteIds: string[] } {
  const chantier = snapshot.chantiers.find((item) => item.id === chantierId);
  const delayDays = clampDelay(
    options.delayDays ?? chantier?.delai_sous_traitance_jours,
  );
  const estimative = Boolean(
    options.datesEstimatives ?? chantier?.dates_estimatives,
  );
  const wantLivraison = Boolean(options.avecLivraison);
  const wantFab = options.avecFabrication !== false;
  const current = chantierPhaseOptions(snapshot, chantierId);
  const flagsChanged =
    current.avecFabrication !== wantFab ||
    current.avecPose !== options.avecPose ||
    current.avecThermolaquage !== options.avecThermolaquage ||
    current.avecLivraison !== wantLivraison;

  const patches: PhasePatch[] = [];
  const inserts: PhaseInsert[] = [];
  const deleteIds: string[] = [];
  const elements = snapshot.elements.filter(
    (element) => element.chantier_id === chantierId,
  );

  if (!flagsChanged) {
    applyAssigneeEdits(
      snapshot,
      chantierId,
      options,
      wantLivraison,
      patches,
      inserts,
      deleteIds,
    );
    return { patches, inserts, deleteIds };
  }

  for (const element of elements) {
    const siblings = snapshot.phases.filter(
      (phase) => phase.element_id === element.id,
    );
    const fab = siblings.find((item) => item.type_phase === "fabrication");
    const log = siblings.find((item) => item.type_phase === "logistique");
    const liv = siblings.find((item) => item.type_phase === "livraison");
    const pose = siblings.find((item) => item.type_phase === "pose");
    const kept = siblings.filter((phase) => {
      if (phase.type_phase === "fabrication" && !wantFab) return false;
      if (phase.type_phase === "logistique" && !options.avecThermolaquage) {
        return false;
      }
      if (phase.type_phase === "livraison" && !wantLivraison) return false;
      if (phase.type_phase === "pose" && !options.avecPose) return false;
      return true;
    });

    if (!wantFab && fab) deleteIds.push(fab.id);
    if (!options.avecThermolaquage && log) deleteIds.push(log.id);
    if (!wantLivraison && liv) deleteIds.push(liv.id);
    if (!options.avecPose && pose) deleteIds.push(pose.id);

    if (wantFab) {
      const fabHours = Math.max(8, Number(fab?.duree_estimee_heures) || 0);
      const after = lastDatedEnd(
        kept.filter((item) => item.type_phase !== "fabrication"),
        "fabrication",
      );
      const range = scheduleHoursOnAssignee(
        snapshot,
        options.employeFabricationId || fab?.employe_id || null,
        after ? nextWorkingDayAfter(after) : earliestAvailableWorkDate(snapshot),
        fabHours,
      );
      if (fab && !deleteIds.includes(fab.id)) {
        const shouldRecale = !current.avecFabrication || !fab.date_debut;
        if (shouldRecale) {
          patches.push({
            id: fab.id,
            date_debut: range.start,
            date_fin: range.end,
            employe_id: pickEmployeeForPhase(
              snapshot,
              "fabrication",
              range.start,
              range.end,
              options.employeFabricationId || fab.employe_id,
            ),
            heure_debut: fab.heure_debut ?? "07:30",
            duree_estimee_heures: fabHours,
          });
        }
      } else if (!fab) {
        inserts.push({
          element_id: element.id,
          type_phase: "fabrication",
          duree_estimee_heures: fabHours,
          date_debut: range.start,
          date_fin: range.end,
          heure_debut: "07:30",
          employe_id: pickEmployeeForPhase(
            snapshot,
            "fabrication",
            range.start,
            range.end,
            options.employeFabricationId,
          ),
          statut: "a_faire",
          urgent: false,
          heures_supplementaires_par_jour: 0,
          dates_estimatives: estimative,
        });
      }
    }

    let thermoEnd: string | null = null;
    if (options.avecThermolaquage && current.avecThermolaquage) {
      thermoEnd = log?.date_fin || log?.date_debut || null;
    } else if (options.avecThermolaquage) {
      const after = lastDatedEnd(
        kept.filter((item) => item.type_phase !== "logistique"),
        "logistique",
      );
      const range = scheduleAfter(snapshot, after, delayDays);
      const hours = delayDays * 8;
      thermoEnd = range.end;
      if (log && !deleteIds.includes(log.id)) {
        patches.push({
          id: log.id,
          date_debut: range.start,
          date_fin: range.end,
          employe_id: null,
          heure_debut: null,
          duree_estimee_heures: Math.max(hours, log.duree_estimee_heures || 0),
        });
      } else if (!log) {
        inserts.push({
          element_id: element.id,
          type_phase: "logistique",
          duree_estimee_heures: hours,
          date_debut: range.start,
          date_fin: range.end,
          employe_id: null,
          statut: "a_faire",
          urgent: Boolean(fab?.urgent),
          heures_supplementaires_par_jour: 0,
          dates_estimatives: estimative,
        });
      }
    }

    let livraisonEnd: string | null = null;
    if (
      wantLivraison &&
      current.avecLivraison &&
      current.avecThermolaquage === options.avecThermolaquage
    ) {
      livraisonEnd = liv?.date_fin || liv?.date_debut || null;
    } else if (wantLivraison) {
      const livHours = Math.max(
        0.5,
        Number(options.dureeLivraisonHeures) ||
          Number(liv?.duree_estimee_heures) ||
          2,
      );
      const after =
        thermoEnd ||
        lastDatedEnd(
          kept.filter((item) => item.type_phase !== "livraison"),
          "livraison",
        );
      const range = scheduleHoursOnAssignee(
        snapshot,
        liv?.employe_id ?? options.employeLivraisonId ?? null,
        after ? nextWorkingDayAfter(after) : firstWorkingOnOrAfter(todayIso()),
        livHours,
      );
      livraisonEnd = range.end;
      const employeId = pickEmployeeForPhase(
        snapshot,
        "livraison",
        range.start,
        range.end,
        options.employeLivraisonId || liv?.employe_id || fab?.employe_id,
      );
      if (liv && !deleteIds.includes(liv.id)) {
        patches.push({
          id: liv.id,
          date_debut: range.start,
          date_fin: range.end,
          employe_id: employeId,
          heure_debut: liv.heure_debut ?? "07:30",
          duree_estimee_heures: livHours,
        });
      } else if (!liv) {
        inserts.push({
          element_id: element.id,
          type_phase: "livraison",
          duree_estimee_heures: livHours,
          date_debut: range.start,
          date_fin: range.end,
          heure_debut: "07:30",
          employe_id: employeId,
          statut: "a_faire",
          urgent: Boolean(fab?.urgent),
          heures_supplementaires_par_jour: 0,
          dates_estimatives: estimative,
        });
      }
    }

    if (options.avecPose) {
      const poseHours = Math.max(8, Number(pose?.duree_estimee_heures) || 0);
      const after =
        livraisonEnd ||
        thermoEnd ||
        lastDatedEnd(
          kept.filter((item) => item.type_phase !== "pose"),
          "pose",
        );
      const range = scheduleHoursOnAssignee(
        snapshot,
        options.employePoseId || pose?.employe_id || fab?.employe_id || null,
        after ? nextWorkingDayAfter(after) : earliestAvailableWorkDate(snapshot),
        poseHours,
      );
      if (pose && !deleteIds.includes(pose.id)) {
        const shouldRecale =
          !current.avecPose ||
          current.avecThermolaquage !== options.avecThermolaquage ||
          current.avecLivraison !== wantLivraison ||
          !pose.date_debut;
        if (shouldRecale) {
          patches.push({
            id: pose.id,
            date_debut: range.start,
            date_fin: range.end,
            employe_id: pickEmployeeForPhase(
              snapshot,
              "pose",
              range.start,
              range.end,
              options.employePoseId || pose.employe_id || fab?.employe_id,
            ),
            heure_debut: pose.heure_debut ?? null,
            duree_estimee_heures: poseHours,
          });
        }
      } else if (!pose) {
        inserts.push({
          element_id: element.id,
          type_phase: "pose",
          duree_estimee_heures: poseHours,
          date_debut: range.start,
          date_fin: range.end,
          heure_debut: "07:30",
          employe_id: pickEmployeeForPhase(
            snapshot,
            "pose",
            range.start,
            range.end,
            options.employePoseId || fab?.employe_id,
          ),
          statut: "a_faire",
          urgent: Boolean(fab?.urgent),
          heures_supplementaires_par_jour: 0,
          dates_estimatives: estimative,
        });
      }
    }
  }

  applyAssigneeEdits(
    snapshot,
    chantierId,
    options,
    wantLivraison,
    patches,
    inserts,
    deleteIds,
  );
  return { patches, inserts, deleteIds };
}

/** Met à jour la durée estimée d’une phase et recale la suite (comme à la création). */
export function planChantierDurationEdits(
  snapshot: PlanningSnapshot,
  chantierId: string,
  hoursByPhaseId: Record<string, number>,
  delayDays?: number | null,
): { patches: PhasePatch[]; inserts: PhaseInsert[]; deleteIds: string[] } {
  const chantier = snapshot.chantiers.find((item) => item.id === chantierId);
  const delay = clampDelay(
    delayDays ?? chantier?.delai_sous_traitance_jours,
  );
  const patches: PhasePatch[] = [];
  const inserts: PhaseInsert[] = [];
  const deleteIds: string[] = [];
  const elements = snapshot.elements.filter(
    (element) => element.chantier_id === chantierId,
  );

  for (const element of elements) {
    const siblings = snapshot.phases.filter(
      (phase) => phase.element_id === element.id,
    );
    let fromType: TypePhase | null = null;
    for (const phase of siblings) {
      if (!(phase.id in hoursByPhaseId)) continue;
      const nextHours = Math.max(0, Number(hoursByPhaseId[phase.id]) || 0);
      const currentHours = Number(phase.duree_estimee_heures) || 0;
      if (nextHours === currentHours) continue;
      mergePhasePatch(patches, phase, { duree_estimee_heures: nextHours });
      if (
        !fromType ||
        PHASE_ORDER.indexOf(phase.type_phase) < PHASE_ORDER.indexOf(fromType)
      ) {
        fromType = phase.type_phase;
      }
    }
    if (fromType) {
      recaleElementChain(
        snapshot,
        element.id,
        fromType,
        delay,
        patches,
        inserts,
        deleteIds,
      );
    }
  }
  return { patches, inserts, deleteIds };
}

function runPhaseChainSelfCheck() {
  const snapshot: PlanningSnapshot = {
    employees: [
      { id: "emp-a", nom: "A", roles: ["fabrication", "pose"], actif: true },
    ],
    chantiers: [],
    elements: [],
    phases: [],
    absences: [],
    signalements: [],
    receptions: [],
    demandes: [],
    horaires: [],
  };
  const extraAuto = pickDistinctEmployeesForPhase(
    {
      ...snapshot,
      employees: [
        {
          id: "emp-alexis",
          nom: "Alexis",
          roles: ["fabrication", "pose"],
          actif: true,
        },
        {
          id: "emp-romain",
          nom: "Romain",
          roles: ["fabrication", "pose"],
          actif: true,
        },
      ],
    },
    "pose",
    "2026-09-21",
    "2026-09-21",
    1,
    ["emp-alexis"],
  );
  if (extraAuto[0] !== "emp-romain") {
    throw new Error("phase-chain: +1 poseur auto prend le suivant libre");
  }
  if (extraAutoPoseurCount(0, 0) !== 0 || extraAutoPoseurCount(0, 1) !== 0) {
    throw new Error("phase-chain: sans nom, +0/+1 = une seule pose auto");
  }
  if (extraAutoPoseurCount(0, 2) !== 1 || extraAutoPoseurCount(1, 1) !== 1) {
    throw new Error("phase-chain: +2 sans nom / +1 avec un nommé");
  }
  const basePhase = {
    duree_estimee_heures: 8,
    date_debut: null as string | null,
    date_fin: null as string | null,
    employe_id: null as string | null,
    urgent: false,
  };
  const chained = applyPhaseChainOnCreate(snapshot, {
    nom_client: "Test",
    adresse: "",
    lien_dossier_onedrive: null,
    priorite: "normal",
    date_debut: "2026-09-14",
    avec_pose: true,
    avec_thermolaquage: true,
    elements: [
      {
        nom_element: "Portail",
        phases: [
          { ...basePhase, type_phase: "administratif", duree_estimee_heures: 0 },
          {
            ...basePhase,
            type_phase: "fabrication",
            date_debut: "2026-09-14",
            date_fin: "2026-09-14",
          },
          { ...basePhase, type_phase: "logistique", duree_estimee_heures: 0 },
          { ...basePhase, type_phase: "pose", duree_estimee_heures: 8 },
        ],
      },
    ],
  });
  const log = chained.elements[0]?.phases.find((item) => item.type_phase === "logistique");
  const posePhase = chained.elements[0]?.phases.find((item) => item.type_phase === "pose");
  if (log?.date_debut !== "2026-09-16" || log.date_fin !== "2026-09-22") {
    throw new Error(
      `phase-chain: thermo provisoire 5 j. après fab, reçu ${log?.date_debut} → ${log?.date_fin}`,
    );
  }
  if (!log?.dates_estimatives || !posePhase?.dates_estimatives) {
    throw new Error("phase-chain: thermo et pose restent estimatifs avant le BC");
  }
  if (posePhase?.date_debut !== "2026-09-23") {
    throw new Error(
      `phase-chain: pose après le thermo provisoire, reçu ${posePhase?.date_debut}`,
    );
  }

  const packed = applyPhaseChainOnCreate(snapshot, {
    nom_client: "Deadline",
    adresse: "",
    lien_dossier_onedrive: null,
    priorite: "prioritaire",
    date_debut: "2026-09-14",
    date_fin: "2026-09-18",
    avec_pose: true,
    avec_fabrication: true,
    avec_thermolaquage: false,
    elements: [
      {
        nom_element: "Portail",
        phases: [
          { ...basePhase, type_phase: "administratif", duree_estimee_heures: 0 },
          { ...basePhase, type_phase: "fabrication", duree_estimee_heures: 8 },
          { ...basePhase, type_phase: "logistique", duree_estimee_heures: 0 },
          { ...basePhase, type_phase: "pose", duree_estimee_heures: 8 },
        ],
      },
    ],
  });
  const packedFab = packed.elements[0]?.phases.find(
    (item) => item.type_phase === "fabrication",
  );
  const packedPose = packed.elements[0]?.phases.find(
    (item) => item.type_phase === "pose",
  );
  if (packedPose?.date_fin !== "2026-09-18") {
    throw new Error(
      `phase-chain: deadline vendredi, pose doit finir le 18, reçu ${packedPose?.date_fin}`,
    );
  }
  if (
    !packedFab?.date_debut ||
    packedFab.date_debut > "2026-09-18" ||
    packedFab.date_debut >= (packedPose?.date_debut ?? "")
  ) {
    throw new Error(
      `phase-chain: rebours, fab avant la pose, reçu fab ${packedFab?.date_debut} pose ${packedPose?.date_debut}`,
    );
  }

  const parallel = applyPhaseChainOnCreate(snapshot, {
    nom_client: "Dossier 1",
    adresse: "",
    lien_dossier_onedrive: null,
    priorite: "normal",
    date_debut: "2026-09-14",
    avec_pose: true,
    avec_thermolaquage: true,
    elements: [
      {
        nom_element: "Travaux",
        phases: [
          { ...basePhase, type_phase: "administratif", duree_estimee_heures: 14 },
          { ...basePhase, type_phase: "fabrication", duree_estimee_heures: 14 },
          { ...basePhase, type_phase: "logistique", duree_estimee_heures: 0 },
          { ...basePhase, type_phase: "pose", duree_estimee_heures: 14 },
        ],
      },
    ],
  });
  const admin = parallel.elements[0]?.phases.find((item) => item.type_phase === "administratif");
  const fab = parallel.elements[0]?.phases.find((item) => item.type_phase === "fabrication");
  const thermo = parallel.elements[0]?.phases.find((item) => item.type_phase === "logistique");
  const pose14 = parallel.elements[0]?.phases.find((item) => item.type_phase === "pose");
  if (admin?.date_debut !== "2026-09-14" || admin.date_fin !== "2026-09-15") {
    throw new Error(
      `phase-chain: 14 h admin dès le 14 doit finir le 15, reçu ${admin?.date_debut} → ${admin?.date_fin}`,
    );
  }
  if (fab?.date_debut !== "2026-09-16") {
    throw new Error(
      `phase-chain: fabrication après admin, reçu ${fab?.date_debut}`,
    );
  }
  if (thermo?.date_debut !== "2026-09-18" || thermo.date_fin !== "2026-09-24") {
    throw new Error(
      `phase-chain: thermo provisoire après fab 14 h, reçu ${thermo?.date_debut} → ${thermo?.date_fin}`,
    );
  }
  if (pose14?.date_debut !== "2026-09-25") {
    throw new Error(
      `phase-chain: pose après le thermo provisoire, reçu ${pose14?.date_debut}`,
    );
  }
  if (
    (admin.date_fin ?? "") >= (fab.date_debut ?? "") ||
    (fab.date_fin ?? "") >= (thermo.date_debut ?? "") ||
    (thermo.date_fin ?? "") >= (pose14.date_debut ?? "")
  ) {
    throw new Error("phase-chain: les phases ne doivent pas se chevaucher");
  }

  const noThermo = applyPhaseChainOnCreate(snapshot, {
    ...chained,
    avec_thermolaquage: false,
    avec_pose: true,
    elements: chained.elements.map((element) => ({
      ...element,
      phases: element.phases.map((phase) =>
        phase.type_phase === "pose" || phase.type_phase === "logistique"
          ? { ...phase, date_debut: null, date_fin: null, duree_estimee_heures: phase.type_phase === "pose" ? 8 : 0 }
          : phase,
      ),
    })),
  });
  const skippedLog = noThermo.elements[0]?.phases.find((item) => item.type_phase === "logistique");
  const poseAfterFab = noThermo.elements[0]?.phases.find((item) => item.type_phase === "pose");
  if (skippedLog?.duree_estimee_heures !== 0 || skippedLog.date_debut) {
    throw new Error("phase-chain: sans thermolaquage, pas de phase laquage");
  }
  if (poseAfterFab?.date_debut !== "2026-09-16") {
    throw new Error(
      `phase-chain: pose après fab sans laquage, reçu ${poseAfterFab?.date_debut}`,
    );
  }
  const manual = applyPhaseChainOnCreate(snapshot, {
    nom_client: "Test",
    adresse: "",
    lien_dossier_onedrive: null,
    priorite: "normal",
    date_debut: "2026-09-14",
    avec_pose: false,
    avec_thermolaquage: true,
    delai_laquage_jours: 3,
    elements: [
      {
        nom_element: "Portail",
        phases: [
          {
            ...basePhase,
            type_phase: "fabrication",
            date_debut: "2026-09-14",
            date_fin: "2026-09-14",
          },
          { ...basePhase, type_phase: "logistique", duree_estimee_heures: 0 },
          { ...basePhase, type_phase: "pose", duree_estimee_heures: 8 },
        ],
      },
    ],
  });
  const shortLog = manual.elements[0]?.phases.find((item) => item.type_phase === "logistique");
  const noPose = manual.elements[0]?.phases.find((item) => item.type_phase === "pose");
  if (shortLog?.date_debut !== "2026-09-16" || shortLog?.date_fin !== "2026-09-18") {
    throw new Error(
      `phase-chain: laquage provisoire 3 j. après fab, reçu ${shortLog?.date_debut} → ${shortLog?.date_fin}`,
    );
  }
  if (!shortLog?.dates_estimatives) {
    throw new Error("phase-chain: le laquage provisoire doit rester estimatif jusqu’au BC");
  }
  if (noPose?.date_debut || noPose?.duree_estimee_heures) {
    throw new Error("phase-chain: sans pose, la phase pose doit rester vide");
  }

  const poseOnly = applyPhaseChainOnCreate(snapshot, {
    nom_client: "Pose seule",
    adresse: "",
    lien_dossier_onedrive: null,
    priorite: "normal",
    date_debut: "2026-09-14",
    avec_fabrication: false,
    avec_pose: true,
    avec_thermolaquage: false,
    avec_livraison: false,
    elements: [
      {
        nom_element: "Garde-corps",
        phases: [
          { ...basePhase, type_phase: "fabrication", duree_estimee_heures: 0 },
          { ...basePhase, type_phase: "pose", duree_estimee_heures: 8 },
        ],
      },
    ],
  });
  const poseOnlyFab = poseOnly.elements[0]?.phases.find(
    (item) => item.type_phase === "fabrication",
  );
  const poseOnlyPose = poseOnly.elements[0]?.phases.find(
    (item) => item.type_phase === "pose",
  );
  if (poseOnlyFab?.date_debut || poseOnlyFab?.duree_estimee_heures) {
    throw new Error("phase-chain: sans fabrication, la phase fabrication doit rester vide");
  }
  if (poseOnlyPose?.date_debut !== "2026-09-14") {
    throw new Error(
      `phase-chain: pose seule doit commencer au début du chantier, reçu ${poseOnlyPose?.date_debut}`,
    );
  }

  const delayed = applyBonCommandeDelay(
    {
      ...snapshot,
      chantiers: [
        {
          id: "ch-1",
          nom_client: "Test",
          adresse: "",
          lien_dossier_onedrive: null,
          priorite: "normal",
          date_creation: "2026-09-01",
        },
      ],
      elements: [{ id: "el-1", chantier_id: "ch-1", nom_element: "Portail" }],
      phases: [
        {
          id: "log-1",
          element_id: "el-1",
          type_phase: "logistique",
          duree_estimee_heures: 40,
          date_debut: "2026-09-15",
          date_fin: "2026-09-21",
          employe_id: null,
          statut: "a_faire",
          urgent: false,
          dates_estimatives: true,
        },
        {
          id: "pose-1",
          element_id: "el-1",
          type_phase: "pose",
          duree_estimee_heures: 8,
          date_debut: "2026-09-22",
          date_fin: "2026-09-22",
          employe_id: "emp-a",
          statut: "a_faire",
          urgent: false,
          dates_estimatives: true,
        },
      ],
    },
    "ch-1",
    "2026-09-14",
    5,
  );
  const logPatch = delayed.patches.find((item) => item.id === "log-1");
  const posePatch = delayed.patches.find((item) => item.id === "pose-1");
  if (logPatch?.date_debut !== "2026-09-14" || logPatch.date_fin !== "2026-09-18") {
    throw new Error(
      `phase-chain: BC du lundi 14 → 5 j. jusqu’au 18, reçu ${logPatch?.date_debut} → ${logPatch?.date_fin}`,
    );
  }
  if (posePatch?.date_debut !== "2026-09-21") {
    throw new Error(
      `phase-chain: pose après le délai BC, reçu ${posePatch?.date_debut}`,
    );
  }

  const withDelivery = applyPhaseChainOnCreate(snapshot, {
    nom_client: "Livraison",
    adresse: "",
    lien_dossier_onedrive: null,
    priorite: "normal",
    date_debut: "2026-09-14",
    avec_pose: true,
    avec_thermolaquage: true,
    avec_livraison: true,
    elements: [
      {
        nom_element: "Portail",
        phases: [
          {
            ...basePhase,
            type_phase: "fabrication",
            date_debut: "2026-09-14",
            date_fin: "2026-09-14",
          },
          { ...basePhase, type_phase: "logistique", duree_estimee_heures: 0 },
          {
            ...basePhase,
            type_phase: "livraison",
            duree_estimee_heures: 2,
            employe_id: "emp-a",
          },
          { ...basePhase, type_phase: "pose", duree_estimee_heures: 8 },
        ],
      },
    ],
  });
  const livCreate = withDelivery.elements[0]?.phases.find(
    (item) => item.type_phase === "livraison",
  );
  const poseAfterLiv = withDelivery.elements[0]?.phases.find(
    (item) => item.type_phase === "pose",
  );
  const thermoCreate = withDelivery.elements[0]?.phases.find(
    (item) => item.type_phase === "logistique",
  );
  if (thermoCreate?.date_debut !== "2026-09-16" || thermoCreate.date_fin !== "2026-09-22") {
    throw new Error(
      `phase-chain: thermo provisoire 5 j. après fab, reçu ${thermoCreate?.date_debut} → ${thermoCreate?.date_fin}`,
    );
  }
  if (!thermoCreate?.dates_estimatives || !livCreate?.dates_estimatives || !poseAfterLiv?.dates_estimatives) {
    throw new Error("phase-chain: thermo / livraison / pose restent estimatifs avant le BC");
  }
  if (livCreate?.date_debut !== "2026-09-23" || livCreate.duree_estimee_heures !== 2) {
    throw new Error(
      `phase-chain: livraison après le thermo provisoire, reçu ${livCreate?.date_debut} / ${livCreate?.duree_estimee_heures}h`,
    );
  }
  if (poseAfterLiv?.date_debut !== "2026-09-24") {
    throw new Error(
      `phase-chain: pose après livraison, reçu ${poseAfterLiv?.date_debut}`,
    );
  }

  const editBase: PlanningSnapshot = {
    ...snapshot,
    chantiers: [
      {
        id: "ch-edit",
        nom_client: "Edit",
        adresse: "",
        lien_dossier_onedrive: null,
        priorite: "normal",
        date_creation: "2026-09-01",
      },
    ],
    elements: [{ id: "el-edit", chantier_id: "ch-edit", nom_element: "Portail" }],
    phases: [
      {
        id: "fab-edit",
        element_id: "el-edit",
        type_phase: "fabrication",
        duree_estimee_heures: 8,
        date_debut: "2026-09-14",
        date_fin: "2026-09-14",
        heure_debut: "07:30",
        employe_id: "emp-a",
        statut: "a_faire",
        urgent: false,
      },
    ],
  };
  const addedBoth = planChantierOptionEdits(editBase, "ch-edit", {
    avecPose: true,
    avecThermolaquage: true,
    delayDays: 5,
  });
  const addedLog = addedBoth.inserts.find((item) => item.type_phase === "logistique");
  const addedPose = addedBoth.inserts.find((item) => item.type_phase === "pose");
  if (addedLog?.date_debut !== "2026-09-15" || addedLog.date_fin !== "2026-09-21") {
    throw new Error(
      `phase-chain: thermo après fab (5 j.), reçu ${addedLog?.date_debut} → ${addedLog?.date_fin}`,
    );
  }
  if (addedPose?.date_debut !== "2026-09-22") {
    throw new Error(
      `phase-chain: pose après le nouveau thermo, reçu ${addedPose?.date_debut}`,
    );
  }

  const withPose: PlanningSnapshot = {
    ...editBase,
    phases: [
      ...editBase.phases,
      {
        id: "pose-edit",
        element_id: "el-edit",
        type_phase: "pose",
        duree_estimee_heures: 8,
        date_debut: "2026-09-15",
        date_fin: "2026-09-15",
        heure_debut: "07:30",
        employe_id: "emp-a",
        statut: "a_faire",
        urgent: false,
      },
    ],
  };
  const thermoThenRecale = planChantierOptionEdits(withPose, "ch-edit", {
    avecPose: true,
    avecThermolaquage: true,
    delayDays: 5,
  });
  const recaledPose = thermoThenRecale.patches.find((item) => item.id === "pose-edit");
  if (recaledPose?.date_debut !== "2026-09-22") {
    throw new Error(
      `phase-chain: pose existante recalee après thermo, reçu ${recaledPose?.date_debut}`,
    );
  }

  const removedFab = planChantierOptionEdits(editBase, "ch-edit", {
    avecFabrication: false,
    avecPose: false,
    avecThermolaquage: false,
  });
  if (!removedFab.deleteIds.includes("fab-edit")) {
    throw new Error("phase-chain: passer Fabrication à Non doit supprimer la phase");
  }

  const removed = planChantierOptionEdits(withPose, "ch-edit", {
    avecPose: false,
    avecThermolaquage: false,
  });
  if (!removed.deleteIds.includes("pose-edit")) {
    throw new Error("phase-chain: passer Pose à Non doit supprimer la phase");
  }

  const longerFab = planChantierDurationEdits(withPose, "ch-edit", {
    "fab-edit": 16,
  });
  const longerFabPatch = longerFab.patches.find((item) => item.id === "fab-edit");
  if (longerFabPatch?.duree_estimee_heures !== 16) {
    throw new Error("phase-chain: la durée fabrication doit pouvoir être modifiée");
  }
  const poseAfterLongerFab = longerFab.patches.find((item) => item.id === "pose-edit");
  if (
    !poseAfterLongerFab?.date_debut ||
    poseAfterLongerFab.date_debut <= (longerFabPatch?.date_fin || "2026-09-14")
  ) {
    throw new Error(
      `phase-chain: allonger la fabrication doit recaler la pose, reçu ${poseAfterLongerFab?.date_debut}`,
    );
  }

  const addedLivraison = planChantierOptionEdits(editBase, "ch-edit", {
    avecPose: true,
    avecThermolaquage: false,
    avecLivraison: true,
    dureeLivraisonHeures: 2,
    employeLivraisonId: "emp-a",
  });
  const livInsert = addedLivraison.inserts.find(
    (item) => item.type_phase === "livraison",
  );
  const poseAfterNewLiv = addedLivraison.inserts.find(
    (item) => item.type_phase === "pose",
  );
  if (livInsert?.date_debut !== "2026-09-15" || livInsert.duree_estimee_heures !== 2) {
    throw new Error(
      `phase-chain: livraison ajoutée après fab, reçu ${livInsert?.date_debut} / ${livInsert?.duree_estimee_heures}h`,
    );
  }
  if (poseAfterNewLiv?.date_debut !== "2026-09-16") {
    throw new Error(
      `phase-chain: pose après la livraison ajoutée, reçu ${poseAfterNewLiv?.date_debut}`,
    );
  }
  if (poseAfterNewLiv?.employe_id !== "emp-a" || addedPose?.employe_id !== "emp-a") {
    throw new Error("phase-chain: la pose ajoutée doit recevoir un salarié");
  }

  const zeroHours = applyPhaseChainOnCreate(snapshot, {
    nom_client: "Zero fab",
    adresse: "",
    lien_dossier_onedrive: null,
    priorite: "normal",
    date_debut: "2026-09-14",
    date_fin: "2026-09-22",
    avec_pose: true,
    avec_thermolaquage: true,
    avec_livraison: true,
    elements: [
      {
        nom_element: "Portail",
        phases: [
          { ...basePhase, type_phase: "administratif", duree_estimee_heures: 0 },
          { ...basePhase, type_phase: "fabrication", duree_estimee_heures: 0 },
          { ...basePhase, type_phase: "logistique", duree_estimee_heures: 0 },
          {
            ...basePhase,
            type_phase: "livraison",
            duree_estimee_heures: 2,
            employe_id: "emp-a",
          },
          { ...basePhase, type_phase: "pose", duree_estimee_heures: 0 },
        ],
      },
    ],
  });
  const zFab = zeroHours.elements[0]?.phases.find(
    (item) => item.type_phase === "fabrication",
  );
  const zPose = zeroHours.elements[0]?.phases.find(
    (item) => item.type_phase === "pose",
  );
  if (!zFab?.date_debut || zFab.duree_estimee_heures !== 8 || zFab.employe_id !== "emp-a") {
    throw new Error(
      `phase-chain: fab 0 h doit être datée et assignée, reçu ${zFab?.date_debut} / ${zFab?.duree_estimee_heures}h / ${zFab?.employe_id}`,
    );
  }
  if (!zPose?.date_debut || zPose.employe_id !== "emp-a") {
    throw new Error(
      `phase-chain: pose 0 h doit être assignée, reçu ${zPose?.date_debut} / ${zPose?.employe_id}`,
    );
  }
  if (missingRequiredAssignee(zeroHours)) {
    throw new Error(missingRequiredAssignee(zeroHours) ?? "phase-chain");
  }

  const unassignedFab: PlanningSnapshot = {
    ...editBase,
    phases: editBase.phases.map((phase) => ({ ...phase, employe_id: null })),
  };
  const repaired = planChantierOptionEdits(unassignedFab, "ch-edit", {
    avecPose: false,
    avecThermolaquage: false,
  });
  const fabFix = repaired.patches.find((item) => item.id === "fab-edit");
  if (fabFix?.employe_id !== "emp-a") {
    throw new Error(
      `phase-chain: fabrication existante sans salarié doit être réparée, reçu ${fabFix?.employe_id}`,
    );
  }

  const cascadeBase: PlanningSnapshot = {
    ...snapshot,
    employees: [
      { id: "emp-a", nom: "A", roles: ["fabrication", "pose", "administratif"], actif: true },
      { id: "emp-b", nom: "Alexis", roles: ["fabrication", "pose"], actif: true },
    ],
    chantiers: [
      {
        id: "ch-cascade",
        nom_client: "Cascade",
        adresse: "",
        lien_dossier_onedrive: null,
        priorite: "normal",
        date_creation: "2026-09-01",
        delai_sous_traitance_jours: 5,
      },
    ],
    elements: [{ id: "el-cascade", chantier_id: "ch-cascade", nom_element: "Portail" }],
    phases: [
      {
        id: "fab-cascade",
        element_id: "el-cascade",
        type_phase: "fabrication",
        duree_estimee_heures: 16,
        date_debut: "2026-09-14",
        date_fin: "2026-09-15",
        heure_debut: "07:30",
        employe_id: "emp-a",
        statut: "a_faire",
        urgent: false,
      },
      {
        id: "log-cascade",
        element_id: "el-cascade",
        type_phase: "logistique",
        duree_estimee_heures: 40,
        date_debut: "2026-09-14",
        date_fin: "2026-09-18",
        heure_debut: null,
        employe_id: null,
        statut: "a_faire",
        urgent: false,
      },
      {
        id: "liv-cascade",
        element_id: "el-cascade",
        type_phase: "livraison",
        duree_estimee_heures: 2,
        date_debut: "2026-09-21",
        date_fin: "2026-09-21",
        heure_debut: "07:30",
        employe_id: "emp-a",
        statut: "a_faire",
        urgent: false,
      },
      {
        id: "pose-cascade",
        element_id: "el-cascade",
        type_phase: "pose",
        duree_estimee_heures: 8,
        date_debut: "2026-09-22",
        date_fin: "2026-09-22",
        heure_debut: "07:30",
        employe_id: "emp-a",
        statut: "a_faire",
        urgent: false,
      },
    ],
    absences: [
      {
        id: "abs-b",
        employe_id: "emp-b",
        date_debut: "2026-09-14",
        date_fin: "2026-09-15",
        type: "conge",
      },
    ],
  };
  const cascaded = planChantierOptionEdits(cascadeBase, "ch-cascade", {
    avecPose: true,
    avecThermolaquage: true,
    avecLivraison: true,
    employeFabricationId: "emp-b",
    delayDays: 5,
  });
  const fabMoved = cascaded.patches.find((item) => item.id === "fab-cascade");
  const logMoved = cascaded.patches.find((item) => item.id === "log-cascade");
  const livMoved = cascaded.patches.find((item) => item.id === "liv-cascade");
  const poseMoved = cascaded.patches.find((item) => item.id === "pose-cascade");
  if (fabMoved?.date_debut !== "2026-09-16" || fabMoved.date_fin !== "2026-09-18") {
    throw new Error(
      `phase-chain: fab recalee sur Alexis, reçu ${fabMoved?.date_debut} → ${fabMoved?.date_fin}`,
    );
  }
  if (logMoved?.date_debut !== "2026-09-21" || logMoved.date_fin !== "2026-09-25") {
    throw new Error(
      `phase-chain: thermo doit suivre la fab, reçu ${logMoved?.date_debut} → ${logMoved?.date_fin}`,
    );
  }
  if (!livMoved?.date_debut || livMoved.date_debut <= logMoved!.date_fin!) {
    throw new Error(
      `phase-chain: livraison doit suivre le thermo, reçu ${livMoved?.date_debut}`,
    );
  }
  if (!poseMoved?.date_debut || poseMoved.date_debut <= livMoved.date_fin!) {
    throw new Error(
      `phase-chain: pose doit suivre la livraison, reçu ${poseMoved?.date_debut}`,
    );
  }
  if (logMoved.date_debut! <= fabMoved.date_fin!) {
    throw new Error("phase-chain: thermo ne doit pas chevaucher la fabrication");
  }

  const assignedOnly: PlanningSnapshot = {
    ...cascadeBase,
    elements: [
      ...cascadeBase.elements,
      { id: "el-other", chantier_id: "ch-cascade", nom_element: "Pergola" },
    ],
    phases: [
      ...cascadeBase.phases.map((phase) =>
        phase.id === "fab-cascade" ? { ...phase, employe_id: "emp-b" } : phase,
      ),
      {
        id: "fab-other",
        element_id: "el-other",
        type_phase: "fabrication",
        duree_estimee_heures: 8,
        date_debut: "2026-09-14",
        date_fin: "2026-09-14",
        heure_debut: "07:30",
        employe_id: "emp-a",
        statut: "a_faire",
        urgent: false,
      },
      {
        id: "log-other",
        element_id: "el-other",
        type_phase: "logistique",
        duree_estimee_heures: 40,
        date_debut: "2026-09-15",
        date_fin: "2026-09-19",
        heure_debut: null,
        employe_id: null,
        statut: "a_faire",
        urgent: false,
      },
    ],
  };
  const recaled = planRecaleAfterAssignees(
    assignedOnly,
    "ch-cascade",
    ["fab-cascade"],
    5,
  );
  const recaleFab = recaled.patches.find((item) => item.id === "fab-cascade");
  const recaleLog = recaled.patches.find((item) => item.id === "log-cascade");
  const recaleOtherFab = recaled.patches.find((item) => item.id === "fab-other");
  const recaleOtherLog = recaled.patches.find((item) => item.id === "log-other");
  if (recaleFab?.date_debut !== "2026-09-16" || recaleFab.date_fin !== "2026-09-18") {
    throw new Error(
      `phase-chain: recale par élément, fab Table, reçu ${recaleFab?.date_debut} → ${recaleFab?.date_fin}`,
    );
  }
  if (!recaleLog?.date_debut || recaleLog.date_debut <= recaleFab.date_fin!) {
    throw new Error(
      `phase-chain: recale par élément, thermo Table doit suivre la fab, reçu ${recaleLog?.date_debut}`,
    );
  }
  if (recaleOtherFab || recaleOtherLog) {
    throw new Error("phase-chain: changer le fabricant de Table ne doit pas recaler Pergola");
  }

  const nobody = applyPhaseChainOnCreate(
    { ...snapshot, employees: [] },
    {
      nom_client: "Sans équipe",
      adresse: "",
      lien_dossier_onedrive: null,
      priorite: "normal",
      date_debut: "2026-09-14",
      avec_pose: true,
      avec_thermolaquage: false,
      elements: [
        {
          nom_element: "Portail",
          phases: [
            { ...basePhase, type_phase: "fabrication", duree_estimee_heures: 8 },
            { ...basePhase, type_phase: "pose", duree_estimee_heures: 8 },
          ],
        },
      ],
    },
  );
  if (!missingRequiredAssignee(nobody)) {
    throw new Error("phase-chain: sans salarié, un message d’erreur est attendu");
  }

  const fridaySnap: PlanningSnapshot = {
    ...snapshot,
    employees: [
      {
        id: "emp-35",
        nom: "Alexis",
        roles: ["fabrication", "pose"],
        actif: true,
        horaires: horairesFromPreset("35"),
      },
    ],
  };
  const longFab = applyPhaseChainOnCreate(fridaySnap, {
    nom_client: "Vendredi",
    adresse: "",
    lien_dossier_onedrive: null,
    priorite: "normal",
    date_debut: "2026-09-15",
    avec_pose: false,
    avec_thermolaquage: false,
    elements: [
      {
        nom_element: "Portail",
        phases: [
          {
            ...basePhase,
            type_phase: "fabrication",
            duree_estimee_heures: 32,
            employe_id: "emp-35",
            date_debut: "2026-09-15",
          },
        ],
      },
    ],
  });
  const longPhase = longFab.elements[0]?.phases.find(
    (item) => item.type_phase === "fabrication",
  );
  if (longPhase?.date_fin !== "2026-09-21") {
    throw new Error(
      `phase-chain: 32 h dès le mardi 15 sept. (35 h/sem.) doivent finir le lundi 21, reçu ${longPhase?.date_fin}`,
    );
  }
}

runPhaseChainSelfCheck();
