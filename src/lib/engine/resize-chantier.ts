import { addDays, calendarDaysBetween } from "@/lib/dates";
import { scheduleChantierSlotDays } from "@/lib/engine/schedule-chantier";
import type {
  PhaseEdits,
  PhaseInsert,
  PhasePatch,
  PhasePlanning,
  PlanningSnapshot,
} from "@/lib/types";

function phaseStart(phase: Pick<PhasePlanning, "date_debut">): string | null {
  return phase.date_debut?.slice(0, 10) || null;
}

function phaseEnd(
  phase: Pick<PhasePlanning, "date_debut" | "date_fin">,
): string | null {
  return phase.date_fin?.slice(0, 10) || phaseStart(phase);
}

function toPatch(phase: PhasePlanning): PhasePatch {
  return {
    id: phase.id,
    date_debut: phase.date_debut,
    date_fin: phase.date_fin,
    employe_id: phase.employe_id,
    heure_debut: phase.heure_debut ?? null,
  };
}

function toInsert(phase: PhasePlanning, date: string): PhaseInsert {
  return {
    element_id: phase.element_id,
    type_phase: phase.type_phase,
    duree_estimee_heures: phase.duree_estimee_heures,
    date_debut: date,
    date_fin: date,
    heure_debut: phase.heure_debut ?? null,
    employe_id: phase.employe_id,
    statut: "a_faire",
    urgent: phase.urgent,
    heures_supplementaires_par_jour: phase.heures_supplementaires_par_jour ?? 0,
  };
}

export function planChantierDateEdits(
  snapshot: PlanningSnapshot,
  chantierId: string,
  newStart: string,
  newEnd: string,
): PhaseEdits {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(newStart) || !/^\d{4}-\d{2}-\d{2}$/.test(newEnd)) {
    throw new Error("Dates invalides.");
  }
  if (newEnd < newStart) {
    throw new Error("La date de fin doit être après la date de début.");
  }

  const elementIds = new Set(
    snapshot.elements
      .filter((element) => element.chantier_id === chantierId)
      .map((element) => element.id),
  );
  const dated = snapshot.phases.filter(
    (phase) => elementIds.has(phase.element_id) && phaseStart(phase),
  );
  if (dated.length === 0) return {};

  const firstDate = dated.reduce((min, phase) => {
    const start = phaseStart(phase)!;
    return start < min ? start : min;
  }, phaseStart(dated[0]!)!);
  const delta = calendarDaysBetween(firstDate, newStart);

  const shifted: PhasePlanning[] = dated.map((phase) => ({
    ...phase,
    date_debut: addDays(phaseStart(phase)!, delta),
    date_fin: addDays(phaseEnd(phase)!, delta),
  }));

  const lastDate = shifted.reduce((max, phase) => {
    const end = phaseEnd(phase)!;
    return end > max ? end : max;
  }, phaseEnd(shifted[0]!)!);

  const deleteIds: string[] = [];
  const byId = new Map(shifted.map((phase) => [phase.id, phase]));

  if (newEnd < lastDate) {
    for (const phase of shifted) {
      const start = phaseStart(phase)!;
      if (start > newEnd) {
        deleteIds.push(phase.id);
        continue;
      }
      if (phaseEnd(phase)! > newEnd) {
        byId.set(phase.id, { ...phase, date_fin: newEnd });
      }
    }
  }

  const remaining = shifted.filter((phase) => !deleteIds.includes(phase.id));
  const inserts: PhaseInsert[] = [];
  if (newEnd > lastDate && remaining.length > 0) {
    const extraDays = scheduleChantierSlotDays(addDays(lastDate, 1), newEnd);
    const maxStart = remaining.reduce((max, phase) => {
      const start = phaseStart(phase)!;
      return start > max ? start : max;
    }, phaseStart(remaining[0]!)!);
    let templates = remaining.filter((phase) => phaseStart(phase) === lastDate);
    if (templates.length === 0) {
      templates = remaining.filter((phase) => phaseStart(phase) === maxStart);
    }
    for (const day of extraDays) {
      for (const template of templates) {
        inserts.push(toInsert(template, day));
      }
    }
  }

  const patches: PhasePatch[] = [];
  for (const original of dated) {
    if (deleteIds.includes(original.id)) continue;
    const next = byId.get(original.id);
    if (!next) continue;
    const changed =
      delta !== 0 ||
      phaseStart(original) !== phaseStart(next) ||
      phaseEnd(original) !== phaseEnd(next);
    if (changed) patches.push(toPatch(next));
  }

  return {
    patches: patches.length ? patches : undefined,
    inserts: inserts.length ? inserts : undefined,
    deleteIds: deleteIds.length ? deleteIds : undefined,
  };
}

export function isEmptyPhaseEdits(edits: PhaseEdits): boolean {
  return (
    !edits.patches?.length &&
    !edits.inserts?.length &&
    !edits.deleteIds?.length
  );
}

export function mergePhaseEdits(first: PhaseEdits, second: PhaseEdits): PhaseEdits {
  const deleted = new Set([
    ...(first.deleteIds ?? []),
    ...(second.deleteIds ?? []),
  ]);
  const patchById = new Map<string, PhasePatch>();
  for (const patch of [...(first.patches ?? []), ...(second.patches ?? [])]) {
    if (deleted.has(patch.id)) continue;
    const previous = patchById.get(patch.id);
    patchById.set(patch.id, previous ? { ...previous, ...patch } : patch);
  }
  const patches = Array.from(patchById.values());
  const inserts = [...(first.inserts ?? []), ...(second.inserts ?? [])];
  const deleteIds = Array.from(deleted);
  return {
    patches: patches.length ? patches : undefined,
    inserts: inserts.length ? inserts : undefined,
    deleteIds: deleteIds.length ? deleteIds : undefined,
  };
}

export function previewPhaseEdits(
  snapshot: PlanningSnapshot,
  edits: PhaseEdits,
): PlanningSnapshot {
  let phases = snapshot.phases;
  const byId = new Map((edits.patches ?? []).map((patch) => [patch.id, patch]));
  if (byId.size > 0) {
    phases = phases.map((phase) => {
      const patch = byId.get(phase.id);
      if (!patch) return phase;
      return {
        ...phase,
        date_debut: patch.date_debut,
        date_fin: patch.date_fin,
        employe_id: patch.employe_id,
        heure_debut:
          patch.heure_debut !== undefined ? patch.heure_debut : phase.heure_debut,
        duree_estimee_heures:
          patch.duree_estimee_heures ?? phase.duree_estimee_heures,
      };
    });
  }
  if (edits.deleteIds?.length) {
    const removed = new Set(edits.deleteIds);
    phases = phases.filter((phase) => !removed.has(phase.id));
  }
  const inserted = (edits.inserts ?? []).map((row, index) => ({
    id: `preview-insert-${index}`,
    ...row,
  }));
  return { ...snapshot, phases: [...phases, ...inserted] };
}

function runResizeSelfCheck() {
  const snapshot: PlanningSnapshot = {
    employees: [
      {
        id: "e1",
        nom: "Jean",
        roles: ["pose"],
        actif: true,
      },
    ],
    chantiers: [
      {
        id: "c1",
        nom_client: "Test",
        adresse: "",
        lien_dossier_onedrive: null,
        priorite: "normal",
        date_creation: "2026-01-01",
      },
    ],
    elements: [{ id: "el1", chantier_id: "c1", nom_element: "Travaux" }],
    phases: [
      {
        id: "am",
        element_id: "el1",
        type_phase: "pose",
        duree_estimee_heures: 4,
        date_debut: "2026-09-10",
        date_fin: "2026-09-10",
        heure_debut: "07:30",
        employe_id: "e1",
        statut: "a_faire",
        urgent: false,
      },
      {
        id: "pm",
        element_id: "el1",
        type_phase: "pose",
        duree_estimee_heures: 3,
        date_debut: "2026-09-10",
        date_fin: "2026-09-10",
        heure_debut: "13:00",
        employe_id: "e1",
        statut: "a_faire",
        urgent: false,
      },
      {
        id: "am2",
        element_id: "el1",
        type_phase: "pose",
        duree_estimee_heures: 4,
        date_debut: "2026-09-11",
        date_fin: "2026-09-11",
        heure_debut: "07:30",
        employe_id: "e1",
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

  const shortened = planChantierDateEdits(
    snapshot,
    "c1",
    "2026-09-10",
    "2026-09-10",
  );
  if (!shortened.deleteIds?.includes("am2") || shortened.deleteIds.length !== 1) {
    throw new Error("resize-chantier: raccourcir doit retirer les jours après la fin");
  }

  const extended = planChantierDateEdits(
    snapshot,
    "c1",
    "2026-09-10",
    "2026-09-14",
  );
  // 11 déjà là ; extra = lun 14 (sam/dim sautés). Templates = phases du 11 (dernier jour).
  if ((extended.inserts?.length ?? 0) !== 1) {
    throw new Error("resize-chantier: allonger doit copier le dernier jour ouvré");
  }
  if (extended.inserts?.[0]?.date_debut !== "2026-09-14") {
    throw new Error("resize-chantier: jour ajouté attendu le lundi 14");
  }
  if (extended.inserts?.some((row) => row.date_debut === "2026-09-12")) {
    throw new Error("resize-chantier: samedi ne doit pas être ajouté");
  }

  const shifted = planChantierDateEdits(
    snapshot,
    "c1",
    "2026-09-14",
    "2026-09-15",
  );
  if ((shifted.patches?.length ?? 0) !== 3) {
    throw new Error("resize-chantier: décaler le début doit déplacer les phases");
  }
  if (shifted.patches?.some((patch) => patch.date_debut === "2026-09-10")) {
    throw new Error("resize-chantier: anciennes dates encore présentes après décalage");
  }
}

runResizeSelfCheck();
