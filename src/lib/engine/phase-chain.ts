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
  const livraison = Boolean(input.avec_livraison);
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
        const skipLivraison = type === "livraison" && !livraison;
        const hours = Number(current.duree_estimee_heures) || 0;
        const skipEmpty =
          type !== "logistique" &&
          hours <= 0 &&
          !(type === "pose" && pose) &&
          !(type === "livraison" && livraison);
        const waitingOnBonCommande = Boolean(thermo);

        if (skipPose || skipThermo || skipLivraison || skipEmpty) {
          if (skipPose || skipThermo || skipLivraison) {
            current.date_debut = null;
            current.date_fin = null;
            if (skipThermo || skipPose || skipLivraison) {
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
          type === "logistique"
            ? delayDays
            : workingDaysFromHours(
                type === "livraison" && hours <= 0 ? 2 : hours,
              );
        if (type === "livraison" && hours <= 0) {
          current.duree_estimee_heures = 2;
        }
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
      const livDays =
        livraison.date_debut && livraison.date_fin
          ? inclusiveWorkingDays(livraison.date_debut, livraison.date_fin)
          : workingDaysFromHours(livraison.duree_estimee_heures || 2);
      const livEnd = rangeEnd(followingStart, livDays);
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
      const poseDays = pose.date_debut && pose.date_fin
        ? inclusiveWorkingDays(pose.date_debut, pose.date_fin)
        : workingDaysFromHours(pose.duree_estimee_heures);
      patches.push({
        id: pose.id,
        date_debut: followingStart,
        date_fin: rangeEnd(followingStart, poseDays),
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
): { avecPose: boolean; avecThermolaquage: boolean; avecLivraison: boolean } {
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
    avecLivraison?: boolean;
    dureeLivraisonHeures?: number | null;
    employeLivraisonId?: string | null;
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
  const current = chantierPhaseOptions(snapshot, chantierId);
  if (
    current.avecPose === options.avecPose &&
    current.avecThermolaquage === options.avecThermolaquage &&
    current.avecLivraison === wantLivraison
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
    const liv = siblings.find((item) => item.type_phase === "livraison");
    const pose = siblings.find((item) => item.type_phase === "pose");
    const kept = siblings.filter((phase) => {
      if (phase.type_phase === "logistique" && !options.avecThermolaquage) {
        return false;
      }
      if (phase.type_phase === "livraison" && !wantLivraison) return false;
      if (phase.type_phase === "pose" && !options.avecPose) return false;
      return true;
    });

    if (!options.avecThermolaquage && log) deleteIds.push(log.id);
    if (!wantLivraison && liv) deleteIds.push(liv.id);
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
      const range = scheduleAfter(
        snapshot,
        after,
        workingDaysFromHours(livHours),
      );
      livraisonEnd = range.end;
      const employeId =
        options.employeLivraisonId || liv?.employe_id || fab?.employe_id || null;
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
      const poseDays =
        pose?.date_debut && pose.date_fin
          ? inclusiveWorkingDays(pose.date_debut, pose.date_fin)
          : workingDaysFromHours(poseHours);
      const after =
        livraisonEnd ||
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
          current.avecLivraison !== wantLivraison ||
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
  if (log?.date_debut !== "2026-09-15" || log.date_fin !== "2026-09-21") {
    throw new Error(
      `phase-chain: thermo provisoire 5 j. après fab, reçu ${log?.date_debut} → ${log?.date_fin}`,
    );
  }
  if (!log?.dates_estimatives || !posePhase?.dates_estimatives) {
    throw new Error("phase-chain: thermo et pose restent estimatifs avant le BC");
  }
  if (posePhase?.date_debut !== "2026-09-22") {
    throw new Error(
      `phase-chain: pose après le thermo provisoire, reçu ${posePhase?.date_debut}`,
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
  if (shortLog?.date_debut !== "2026-09-15" || shortLog?.date_fin !== "2026-09-17") {
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
  if (thermoCreate?.date_debut !== "2026-09-15" || thermoCreate.date_fin !== "2026-09-21") {
    throw new Error(
      `phase-chain: thermo provisoire 5 j. après fab, reçu ${thermoCreate?.date_debut} → ${thermoCreate?.date_fin}`,
    );
  }
  if (!thermoCreate?.dates_estimatives || !livCreate?.dates_estimatives || !poseAfterLiv?.dates_estimatives) {
    throw new Error("phase-chain: thermo / livraison / pose restent estimatifs avant le BC");
  }
  if (livCreate?.date_debut !== "2026-09-22" || livCreate.duree_estimee_heures !== 2) {
    throw new Error(
      `phase-chain: livraison après le thermo provisoire, reçu ${livCreate?.date_debut} / ${livCreate?.duree_estimee_heures}h`,
    );
  }
  if (poseAfterLiv?.date_debut !== "2026-09-23") {
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

  const removed = planChantierOptionEdits(withPose, "ch-edit", {
    avecPose: false,
    avecThermolaquage: false,
  });
  if (!removed.deleteIds.includes("pose-edit")) {
    throw new Error("phase-chain: passer Pose à Non doit supprimer la phase");
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
}

runPhaseChainSelfCheck();
