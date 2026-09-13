import { phaseTypeForRoles } from "@/lib/chantier-status";
import {
  isUnplacedDatedPhase,
  scheduleChantierSlotDays,
  schedulePhaseInserts,
} from "@/lib/engine/schedule-chantier";
import { ordreAffichageFromNom } from "@/lib/display-order";
import { defaultHoraires, normalizeHoraire, normalizeHorairesEmploye } from "@/lib/engine/hours";
import { normalizePhasesForPlanning } from "@/lib/engine/normalize-phases";
import { createSeedSnapshot } from "@/lib/seed";
import type {
  Employee,
  HoraireSaison,
  NewAbsenceInput,
  AbsenceUpdateInput,
  NewChantierInput,
  ChantierUpdateInput,
  ScheduleChantierDayInput,
  NewEmployeeInput,
  NewReceptionInput,
  NewDemandeInput,
  DemandeUpdateInput,
  NewSignalementInput,
  PhaseEdits,
  PhasePatch,
  PlanningSnapshot,
  ReceptionChantier,
  Demande,
  Signalement,
  StatutSignalement,
} from "@/lib/types";
import { TYPES_PHASE } from "@/lib/types";
import {
  phaseIdsStartedToday,
  withConfirmedPhases,
} from "@/lib/dates-estimatives";

const STORAGE_KEY = "vauchel-planning-v1";

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export function loadLocalSnapshot(): PlanningSnapshot {
  if (typeof window === "undefined") {
    return createSeedSnapshot();
  }
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    const seed = createSeedSnapshot();
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(seed));
    return seed;
  }
  try {
    const parsed = JSON.parse(raw) as PlanningSnapshot;
    const loaded: PlanningSnapshot = {
      ...parsed,
      signalements: (parsed.signalements ?? []).map((item) => ({
        ...item,
        sens: item.sens === "avance" ? "avance" : "retard",
        origine:
          item.origine === "decalage_admin" ? "decalage_admin" : "salarie",
      })),
      phases: normalizePhasesForPlanning(
        (parsed.phases ?? []).map((phase) => ({
          ...phase,
          heures_supplementaires_par_jour:
            phase.heures_supplementaires_par_jour ?? 0,
          heure_debut: phase.heure_debut ?? null,
          dates_estimatives: Boolean(phase.dates_estimatives),
        })),
      ),
      employees: (parsed.employees ?? []).map((employee) => ({
        ...employee,
        horaires: normalizeHorairesEmploye(employee.horaires),
        ordre_affichage:
          employee.ordre_affichage ?? ordreAffichageFromNom(employee.nom),
      })),
      chantiers: (parsed.chantiers ?? []).map((chantier) => ({
        ...chantier,
        dates_estimatives: Boolean(chantier.dates_estimatives),
      })),
      horaires:
        parsed.horaires && parsed.horaires.length > 0
          ? parsed.horaires.map((row) => normalizeHoraire(row))
          : defaultHoraires(),
      absences: (parsed.absences ?? []).map((absence) => ({
        ...absence,
        motif_precision: absence.motif_precision ?? null,
      })),
      receptions: parsed.receptions ?? [],
      demandes: (parsed.demandes ?? []).map((row) => ({
        ...row,
        statut: row.statut === "traite" ? "traite" : "en_attente",
        archivee: Boolean(row.archivee),
      })),
      sousTraitants: parsed.sousTraitants ?? [],
    };
    const started = phaseIdsStartedToday(loaded);
    if (started.length) {
      const confirmed = withConfirmedPhases(loaded, started);
      saveLocalSnapshot(confirmed);
      return confirmed;
    }
    return loaded;
  } catch {
    const seed = createSeedSnapshot();
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(seed));
    return seed;
  }
}

function saveLocalSnapshot(snapshot: PlanningSnapshot) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
}

function newId(): string {
  return crypto.randomUUID();
}

export function localCreateChantier(
  snapshot: PlanningSnapshot,
  input: NewChantierInput,
): { snapshot: PlanningSnapshot; chantierId: string } {
  const next = clone(snapshot);
  const chantierId = newId();
  next.chantiers.push({
    id: chantierId,
    nom_client: input.nom_client,
    adresse: input.adresse,
    lien_dossier_onedrive: input.lien_dossier_onedrive,
    priorite: input.priorite,
    date_creation: new Date().toISOString().slice(0, 10),
    dates_estimatives: Boolean(input.dates_estimatives),
  });
  for (const element of input.elements) {
    const elementId = newId();
    next.elements.push({
      id: elementId,
      chantier_id: chantierId,
      nom_element: element.nom_element,
    });
    const phases =
      element.phases.length > 0
        ? element.phases
        : TYPES_PHASE.map((type_phase) => ({
            type_phase,
            duree_estimee_heures: 0,
            date_debut: null,
            date_fin: null,
            heure_debut: null,
            employe_id: null,
            urgent: false,
            heures_supplementaires_par_jour: 0,
          }));
    const uniqueByType = new Map<(typeof phases)[number]["type_phase"], (typeof phases)[number]>();
    for (const phase of phases) {
      uniqueByType.set(phase.type_phase, phase);
    }
    for (const phase of Array.from(uniqueByType.values())) {
      next.phases.push({
        id: newId(),
        element_id: elementId,
        type_phase: phase.type_phase,
        duree_estimee_heures: phase.duree_estimee_heures,
        date_debut: phase.date_debut,
        date_fin: phase.date_fin,
        heure_debut: phase.heure_debut ?? null,
        employe_id: phase.employe_id,
        statut: "a_faire",
        urgent: phase.urgent,
        heures_supplementaires_par_jour:
          phase.heures_supplementaires_par_jour ?? 0,
        dates_estimatives: Boolean(
          phase.dates_estimatives ?? input.dates_estimatives,
        ),
      });
    }
  }
  saveLocalSnapshot(next);
  return { snapshot: next, chantierId };
}

export function localUpsertEmployee(
  snapshot: PlanningSnapshot,
  input: NewEmployeeInput & { id?: string },
): PlanningSnapshot {
  const next = clone(snapshot);
  if (input.id) {
    next.employees = next.employees.map((employee) =>
      employee.id === input.id
        ? {
            ...employee,
            nom: input.nom,
            roles: input.roles,
            actif: input.actif,
            horaires: normalizeHorairesEmploye(input.horaires),
            is_admin: Boolean(input.is_admin),
            ordre_affichage: employee.ordre_affichage,
          }
        : employee,
    );
  } else {
    const employee: Employee = {
      id: newId(),
      nom: input.nom,
      roles: input.roles,
      actif: input.actif,
      is_admin: Boolean(input.is_admin),
      ordre_affichage:
        input.ordre_affichage ?? ordreAffichageFromNom(input.nom),
      horaires: normalizeHorairesEmploye(input.horaires),
    };
    next.employees.push(employee);
  }
  saveLocalSnapshot(next);
  return next;
}

export function localReorderEmployees(
  snapshot: PlanningSnapshot,
  rows: { id: string; ordre_affichage: number }[],
): PlanningSnapshot {
  const next = clone(snapshot);
  const ordreById = new Map(
    rows.map((row) => [row.id, row.ordre_affichage] as const),
  );
  next.employees = next.employees.map((employee) => {
    const ordre = ordreById.get(employee.id);
    return typeof ordre === "number"
      ? { ...employee, ordre_affichage: ordre }
      : employee;
  });
  saveLocalSnapshot(next);
  return next;
}

export function localCreateAbsence(
  snapshot: PlanningSnapshot,
  input: NewAbsenceInput,
): PlanningSnapshot {
  const next = clone(snapshot);
  next.absences.push({
    id: newId(),
    employe_id: input.employe_id,
    date_debut: input.date_debut,
    date_fin: input.date_fin,
    type: input.type,
    motif_precision:
      input.type === "autre" ? input.motif_precision?.trim() || null : null,
  });
  saveLocalSnapshot(next);
  return next;
}

export function localDeleteAbsence(
  snapshot: PlanningSnapshot,
  id: string,
): PlanningSnapshot {
  const next = clone(snapshot);
  next.absences = next.absences.filter((absence) => absence.id !== id);
  saveLocalSnapshot(next);
  return next;
}

export function localUpdateAbsence(
  snapshot: PlanningSnapshot,
  input: AbsenceUpdateInput,
): PlanningSnapshot {
  const next = clone(snapshot);
  next.absences = next.absences.map((absence) =>
    absence.id === input.id
      ? {
          ...absence,
          employe_id: input.employe_id,
          date_debut: input.date_debut,
          date_fin: input.date_fin,
          type: input.type,
          motif_precision:
            input.type === "autre" ? input.motif_precision?.trim() || null : null,
        }
      : absence,
  );
  saveLocalSnapshot(next);
  return next;
}

export function localApplyPhasePatches(
  snapshot: PlanningSnapshot,
  patches: PhasePatch[],
): PlanningSnapshot {
  return localApplyPhaseEdits(snapshot, { patches });
}

export function localApplyPhaseEdits(
  snapshot: PlanningSnapshot,
  edits: PhaseEdits,
): PlanningSnapshot {
  const next = clone(snapshot);
  const byId = new Map((edits.patches ?? []).map((patch) => [patch.id, patch]));
  if (byId.size > 0) {
    next.phases = next.phases.map((phase) => {
      const patch = byId.get(phase.id);
      if (!patch) return phase;
      return {
        ...phase,
        date_debut: patch.date_debut,
        date_fin: patch.date_fin,
        employe_id: patch.employe_id,
        heure_debut:
          patch.heure_debut !== undefined ? patch.heure_debut : phase.heure_debut,
      };
    });
  }
  if (edits.deleteIds?.length) {
    const removed = new Set(edits.deleteIds);
    next.phases = next.phases.filter((phase) => !removed.has(phase.id));
    next.signalements = (next.signalements ?? []).filter(
      (item) => !removed.has(item.phase_id),
    );
    next.receptions = (next.receptions ?? []).filter(
      (item) => !removed.has(item.phase_id),
    );
  }
  for (const row of edits.inserts ?? []) {
    next.phases.push({
      id: newId(),
      ...row,
    });
  }
  saveLocalSnapshot(next);
  return next;
}

export function localCreateSignalement(
  snapshot: PlanningSnapshot,
  input: NewSignalementInput,
): PlanningSnapshot {
  const next = clone(snapshot);
  const row: Signalement = {
    id: newId(),
    employe_id: input.employe_id,
    phase_id: input.phase_id,
    retard_demi_journees: input.retard_demi_journees,
    sens: input.sens,
    note: input.note,
    statut: input.statut ?? "en_attente",
    origine: input.origine ?? "salarie",
    date_creation: new Date().toISOString(),
  };
  next.signalements = [...(next.signalements ?? []), row];
  saveLocalSnapshot(next);
  return next;
}

export function localSetSignalementStatut(
  snapshot: PlanningSnapshot,
  id: string,
  statut: StatutSignalement,
): PlanningSnapshot {
  const next = clone(snapshot);
  next.signalements = (next.signalements ?? []).map((item) =>
    item.id === id ? { ...item, statut } : item,
  );
  saveLocalSnapshot(next);
  return next;
}

export function localCreateDemande(
  snapshot: PlanningSnapshot,
  input: NewDemandeInput & { employe_id: string },
): PlanningSnapshot {
  const next = clone(snapshot);
  const row: Demande = {
    id: newId(),
    employe_id: input.employe_id,
    categorie: input.categorie,
    message: input.message.trim(),
    date_creation: new Date().toISOString(),
    statut: "en_attente",
    archivee: false,
  };
  next.demandes = [row, ...(next.demandes ?? [])];
  saveLocalSnapshot(next);
  return next;
}

export function localUpdateDemande(
  snapshot: PlanningSnapshot,
  input: DemandeUpdateInput,
): PlanningSnapshot {
  const next = clone(snapshot);
  next.demandes = (next.demandes ?? []).map((row) =>
    row.id === input.id
      ? {
          ...row,
          statut: input.statut ?? row.statut,
          archivee: input.archivee ?? row.archivee,
        }
      : row,
  );
  saveLocalSnapshot(next);
  return next;
}

export function localCreateReception(
  snapshot: PlanningSnapshot,
  input: NewReceptionInput,
): PlanningSnapshot {
  const next = clone(snapshot);
  const row: ReceptionChantier = {
    id: newId(),
    ...input,
    date_signature: new Date().toISOString(),
    onedrive_erreur: null,
  };
  next.receptions = [
    ...(next.receptions ?? []).filter((row) => row.phase_id !== input.phase_id),
    row,
  ];
  next.phases = next.phases.map((phase) =>
    phase.id === input.phase_id ? { ...phase, statut: "termine" } : phase,
  );
  saveLocalSnapshot(next);
  return next;
}

export function localReplaceHoraires(
  snapshot: PlanningSnapshot,
  rows: HoraireSaison[],
): PlanningSnapshot {
  const next = clone(snapshot);
  next.horaires = rows.map((row, index) =>
    normalizeHoraire({
      ...row,
      id: row.id || newId(),
      ordre: index,
    }),
  );
  saveLocalSnapshot(next);
  return next;
}

export function localUpdateChantier(
  snapshot: PlanningSnapshot,
  input: ChantierUpdateInput,
): PlanningSnapshot {
  const next = clone(snapshot);
  next.chantiers = next.chantiers.map((chantier) =>
    chantier.id === input.id
      ? {
          ...chantier,
          nom_client: input.nom_client,
          adresse: input.adresse,
          priorite: input.priorite,
          lien_dossier_onedrive: input.lien_dossier_onedrive,
          dates_estimatives:
            input.dates_estimatives ?? chantier.dates_estimatives,
        }
      : chantier,
  );
  saveLocalSnapshot(next);
  return next;
}

export function localConfirmPhaseDates(
  snapshot: PlanningSnapshot,
  ids: string[],
): PlanningSnapshot {
  const next = withConfirmedPhases(snapshot, ids);
  saveLocalSnapshot(next);
  return next;
}

export function localDeleteChantier(
  snapshot: PlanningSnapshot,
  chantierId: string,
): PlanningSnapshot {
  const next = clone(snapshot);
  const elementIds = new Set(
    next.elements
      .filter((element) => element.chantier_id === chantierId)
      .map((element) => element.id),
  );
  const phaseIds = new Set(
    next.phases
      .filter((phase) => elementIds.has(phase.element_id))
      .map((phase) => phase.id),
  );
  next.signalements = (next.signalements ?? []).filter(
    (item) => !phaseIds.has(item.phase_id),
  );
  next.receptions = (next.receptions ?? []).filter(
    (item) => !phaseIds.has(item.phase_id),
  );
  next.phases = next.phases.filter((phase) => !elementIds.has(phase.element_id));
  next.elements = next.elements.filter(
    (element) => element.chantier_id !== chantierId,
  );
  next.chantiers = next.chantiers.filter((chantier) => chantier.id !== chantierId);
  saveLocalSnapshot(next);
  return next;
}

export function localScheduleChantierDay(
  snapshot: PlanningSnapshot,
  input: ScheduleChantierDayInput,
): PlanningSnapshot {
  const next = clone(snapshot);
  const employee = next.employees.find((item) => item.id === input.employeeId);
  if (!employee || !employee.actif) {
    throw new Error("Salarié introuvable ou inactif.");
  }
  const typePhase = phaseTypeForRoles(employee.roles);
  const days = scheduleChantierSlotDays(input.date, input.dateFin || input.date);
  if (days.length === 0) {
    throw new Error("Aucune journée ouvrée dans la plage choisie.");
  }
  let element = next.elements.find((item) => item.chantier_id === input.chantierId);
  if (!element) {
    element = {
      id: newId(),
      chantier_id: input.chantierId,
      nom_element: "Travaux",
    };
    next.elements.push(element);
  }
  const elementIds = new Set(
    next.elements
      .filter((item) => item.chantier_id === input.chantierId)
      .map((item) => item.id),
  );
  next.phases = next.phases.filter((phase) => {
    if (!elementIds.has(phase.element_id)) return true;
    return !isUnplacedDatedPhase(phase);
  });
  for (const row of schedulePhaseInserts(element.id, typePhase, input.employeeId, days)) {
    next.phases.push({
      id: newId(),
      ...row,
    });
  }
  saveLocalSnapshot(next);
  return next;
}

export function localSetChantierOnedriveLink(
  snapshot: PlanningSnapshot,
  chantierId: string,
  shareUrl: string,
): PlanningSnapshot {
  const next = clone(snapshot);
  next.chantiers = next.chantiers.map((chantier) =>
    chantier.id === chantierId
      ? { ...chantier, lien_dossier_onedrive: shareUrl }
      : chantier,
  );
  saveLocalSnapshot(next);
  return next;
}

export function localSetReceptionOnedriveErreur(
  snapshot: PlanningSnapshot,
  phaseId: string,
  message: string | null,
): PlanningSnapshot {
  const next = clone(snapshot);
  next.receptions = (next.receptions ?? []).map((row) =>
    row.phase_id === phaseId ? { ...row, onedrive_erreur: message } : row,
  );
  saveLocalSnapshot(next);
  return next;
}
