import { addDays, addWorkingDays, isSunday, isoWeekday, workingDaysBetween } from "@/lib/dates";
import { employeeWorksOnDate, hoursForSlot } from "@/lib/engine/hours";
import {
  SEARCH_DAYS,
  buildOccupancy,
  freeRangesOnDate,
  isCompanyHoliday,
  isEmployeeAbsent,
  todayIso,
} from "@/lib/engine/slots";
import type {
  NewChantierInput,
  NewElementInput,
  PhaseInsert,
  PhasePatch,
  PlanningSnapshot,
  TypePhase,
} from "@/lib/types";

export const DEFAULT_LAQUAGE_WORKING_DAYS = 5;

const PHASE_ORDER: TypePhase[] = [
  "administratif",
  "fabrication",
  "logistique",
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

function rangeEnd(start: string, workingDays: number): string {
  if (workingDays <= 1) return start;
  return addWorkingDays(start, workingDays - 1);
}

function workingDaysFromHours(hours: number): number {
  const value = Number(hours) || 0;
  if (value <= 0) return 1;
  return Math.max(1, Math.ceil(value / 8));
}

function inclusiveWorkingDays(start: string, end: string): number {
  if (end <= start) return 1;
  return 1 + workingDaysBetween(start, end);
}

type PhaseInput = NewElementInput["phases"][number];

function phaseOf(phases: PhaseInput[], type: PhaseInput["type_phase"]): PhaseInput | undefined {
  return phases.find((phase) => phase.type_phase === type);
}

function laterDate(left: string, right: string): string {
  return left >= right ? left : right;
}

/**
 * Cale les phases dans l’ordre Administratif → Fabrication → Thermolaquage → Pose.
 * Chaque phase commence au jour ouvré suivant la fin de la précédente (pas de chevauchement).
 */
export function applyPhaseChainOnCreate(
  snapshot: PlanningSnapshot,
  input: NewChantierInput,
): NewChantierInput {
  const thermo = Boolean(input.avec_thermolaquage);
  const pose = Boolean(input.avec_pose);
  const delayDays = clampDelay(input.delai_laquage_jours);
  const laquageDebut = input.date_laquage_debut || null;
  const laquageFin = input.date_laquage_fin || null;
  const chainStart =
    input.date_debut || earliestAvailableWorkDate(snapshot);

  return { ...input, elements: input.elements.map((element) => {
      const phases = element.phases.map((phase) => ({ ...phase }));
      let prevEnd: string | null = null;

      for (const type of PHASE_ORDER) {
        const current = phaseOf(phases, type);
        if (!current) continue;

        const skipPose = type === "pose" && !pose;
        const skipThermo = type === "logistique" && !thermo;
        const hours = Number(current.duree_estimee_heures) || 0;
        const skipEmpty =
          type !== "logistique" && hours <= 0 && !(type === "pose" && pose);
        const pendingThermo =
          type === "logistique" &&
          thermo &&
          !laquageDebut &&
          !laquageFin &&
          !current.date_debut &&
          !current.date_fin;

        if (pendingThermo) {
          current.date_debut = null;
          current.date_fin = null;
          current.employe_id = null;
          continue;
        }

        if (skipPose || skipThermo || skipEmpty) {
          if (skipPose || skipThermo) {
            current.date_debut = null;
            current.date_fin = null;
            if (skipThermo || skipPose) {
              current.duree_estimee_heures = 0;
            }
            if (skipThermo) current.employe_id = null;
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

        const workingDays =
          type === "logistique" ? delayDays : workingDaysFromHours(hours);
        let end = rangeEnd(start, workingDays);
        if (type === "logistique") {
          if (laquageFin && laquageFin >= start) {
            end = laterDate(end, laquageFin);
          }
          current.employe_id = null;
          if (!hours) {
            current.duree_estimee_heures =
              inclusiveWorkingDays(start, end) * 8;
          }
        } else if (current.date_fin && current.date_fin >= start) {
          end = laterDate(end, current.date_fin);
        }

        current.date_debut = start;
        current.date_fin = end < start ? start : end;
        prevEnd = current.date_fin;
      }

      return { ...element, phases };
    }),
  };
}

/**
 * Cale thermolaquage / galvanisation sur 5 jours ouvrés à partir de l’envoi du BC,
 * puis la pose juste après.
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
    if (pose && (pose.duree_estimee_heures > 0 || pose.date_debut)) {
      const poseDays = pose.date_debut && pose.date_fin
        ? inclusiveWorkingDays(pose.date_debut, pose.date_fin)
        : workingDaysFromHours(pose.duree_estimee_heures);
      patches.push({
        id: pose.id,
        date_debut: poseStart,
        date_fin: rangeEnd(poseStart, poseDays),
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
): { avecPose: boolean; avecThermolaquage: boolean } {
  const chantier = snapshot.chantiers.find((item) => item.id === chantierId);
  const elementIds = new Set(
    snapshot.elements
      .filter((element) => element.chantier_id === chantierId)
      .map((element) => element.id),
  );
  const phases = snapshot.phases.filter((phase) => elementIds.has(phase.element_id));
  return {
    avecPose: phases.some(
      (phase) => phase.type_phase === "pose" && phaseHasContent(phase),
    ),
    avecThermolaquage:
      Boolean(chantier?.date_bon_commande) ||
      phases.some(
        (phase) => phase.type_phase === "logistique" && phaseHasContent(phase),
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

/**
 * Ajoute ou retire Thermolaquage / Pose sur un chantier déjà créé.
 * Non → Oui cale la nouvelle phase après la précédente (fab, puis thermo, puis pose).
 */
export function planChantierOptionEdits(
  snapshot: PlanningSnapshot,
  chantierId: string,
  options: {
    avecPose: boolean;
    avecThermolaquage: boolean;
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
  const current = chantierPhaseOptions(snapshot, chantierId);
  if (
    current.avecPose === options.avecPose &&
    current.avecThermolaquage === options.avecThermolaquage
  ) {
    return { patches: [], inserts: [], deleteIds: [] };
  }

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
    const fab = siblings.find((item) => item.type_phase === "fabrication");
    const log = siblings.find((item) => item.type_phase === "logistique");
    const pose = siblings.find((item) => item.type_phase === "pose");
    const kept = siblings.filter((phase) => {
      if (phase.type_phase === "logistique" && !options.avecThermolaquage) {
        return false;
      }
      if (phase.type_phase === "pose" && !options.avecPose) return false;
      return true;
    });

    if (!options.avecThermolaquage && log) deleteIds.push(log.id);
    if (!options.avecPose && pose) deleteIds.push(pose.id);

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

    if (options.avecPose) {
      const poseHours = Math.max(8, Number(pose?.duree_estimee_heures) || 0);
      const poseDays =
        pose?.date_debut && pose.date_fin
          ? inclusiveWorkingDays(pose.date_debut, pose.date_fin)
          : workingDaysFromHours(poseHours);
      const after =
        thermoEnd ||
        lastDatedEnd(
          kept.filter((item) => item.type_phase !== "pose"),
          "pose",
        );
      const range = scheduleAfter(snapshot, after, poseDays);
      if (pose && !deleteIds.includes(pose.id)) {
        const shouldRecale =
          !current.avecPose ||
          current.avecThermolaquage !== options.avecThermolaquage ||
          !pose.date_debut;
        if (shouldRecale) {
          patches.push({
            id: pose.id,
            date_debut: range.start,
            date_fin: range.end,
            employe_id: pose.employe_id,
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
          employe_id: fab?.employe_id ?? null,
          statut: "a_faire",
          urgent: Boolean(fab?.urgent),
          heures_supplementaires_par_jour: 0,
          dates_estimatives: estimative,
        });
      }
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
  if (log?.date_debut || log?.date_fin) {
    throw new Error(
      "phase-chain: le thermolaquage attend le bon de commande, pas la création",
    );
  }
  if (posePhase?.date_debut !== "2026-09-15") {
    throw new Error(
      `phase-chain: pose juste après fab tant que le BC n’est pas envoyé, reçu ${posePhase?.date_debut}`,
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
  if (thermo?.date_debut || thermo?.date_fin) {
    throw new Error(
      "phase-chain: thermolaquage sans dates tant que le BC n’est pas envoyé",
    );
  }
  if (!pose14?.date_debut || pose14.date_debut <= (fab?.date_fin ?? "")) {
    throw new Error(
      `phase-chain: pose après fabrication tant que le BC n’est pas envoyé, reçu ${pose14?.date_debut}`,
    );
  }
  if (
    (admin.date_fin ?? "") >= (fab.date_debut ?? "") ||
    (fab.date_fin ?? "") >= (pose14.date_debut ?? "")
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
  if (poseAfterFab?.date_debut !== "2026-09-15") {
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
  if (shortLog?.date_debut || shortLog?.date_fin) {
    throw new Error(
      "phase-chain: même avec un délai saisi, le laquage attend le bon de commande",
    );
  }
  if (noPose?.date_debut || noPose?.duree_estimee_heures) {
    throw new Error("phase-chain: sans pose, la phase pose doit rester vide");
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
          duree_estimee_heures: 0,
          date_debut: null,
          date_fin: null,
          employe_id: null,
          statut: "a_faire",
          urgent: false,
        },
        {
          id: "pose-1",
          element_id: "el-1",
          type_phase: "pose",
          duree_estimee_heures: 8,
          date_debut: "2026-09-15",
          date_fin: "2026-09-15",
          employe_id: "emp-a",
          statut: "a_faire",
          urgent: false,
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

  const removed = planChantierOptionEdits(withPose, "ch-edit", {
    avecPose: false,
    avecThermolaquage: false,
  });
  if (!removed.deleteIds.includes("pose-edit")) {
    throw new Error("phase-chain: passer Pose à Non doit supprimer la phase");
  }
}

runPhaseChainSelfCheck();
