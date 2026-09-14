import type { Displacement } from "@/lib/engine/planner";
import type { DelayPlanResult } from "@/lib/engine/delay";
import {
  type Absence,
  type NewAbsenceInput,
  type PhasePatch,
  type PlanningSnapshot,
  type Signalement,
  type SignalementProposition,
} from "@/lib/types";

export const PENDING_CHANTIER_MESSAGE =
  "Un signalement est en attente de validation — merci de le traiter avant d’ajouter un nouveau chantier.";

export function pendingSignalements(snapshot: PlanningSnapshot) {
  return (snapshot.signalements ?? []).filter((item) => item.statut === "en_attente");
}

export function hasPendingSignalements(snapshot: PlanningSnapshot): boolean {
  return pendingSignalements(snapshot).length > 0;
}

export function needsAlgoValidation(result: {
  status: string;
  displacements: Displacement[];
}): boolean {
  return result.status === "conflict" || result.displacements.length > 0;
}

export function parseProposition(raw: unknown): SignalementProposition | null {
  if (!raw || typeof raw !== "object") return null;
  const value = raw as Partial<SignalementProposition>;
  if (!Array.isArray(value.patches)) return null;
  return {
    message: typeof value.message === "string" ? value.message : "",
    patches: value.patches.filter(
      (patch): patch is PhasePatch =>
        Boolean(patch && typeof patch === "object" && typeof patch.id === "string"),
    ),
    repercussions: Array.isArray(value.repercussions) ? value.repercussions : [],
    createChantier: value.createChantier,
    alternatives: Array.isArray(value.alternatives)
      ? value.alternatives.filter(
          (item): item is NonNullable<SignalementProposition["alternatives"]>[number] =>
            Boolean(
              item &&
                typeof item === "object" &&
                Array.isArray(
                  (item as { patches?: unknown }).patches,
                ),
            ),
        )
      : undefined,
  };
}

export function repercussionsFromPatches(
  snapshot: PlanningSnapshot,
  patches: PhasePatch[],
): SignalementProposition["repercussions"] {
  const rows: SignalementProposition["repercussions"] = [];
  for (const patch of patches) {
    const phase = snapshot.phases.find((item) => item.id === patch.id);
    if (!phase || !phase.date_debut) continue;
    const element = snapshot.elements.find((item) => item.id === phase.element_id);
    const chantier = snapshot.chantiers.find((item) => item.id === element?.chantier_id);
    const employee = snapshot.employees.find((item) => item.id === (patch.employe_id ?? phase.employe_id));
    const oldDebut = phase.date_debut;
    const oldFin = phase.date_fin ?? phase.date_debut;
    const nextDebut = patch.date_debut ?? oldDebut;
    const nextFin = patch.date_fin ?? oldFin;
    if (nextDebut === oldDebut && nextFin === oldFin && patch.employe_id === phase.employe_id) {
      continue;
    }
    rows.push({
      phase_id: phase.id,
      type_phase: phase.type_phase,
      nom_client: chantier?.nom_client ?? "Chantier",
      nom_salarie: employee?.nom ?? "Non assigné",
      old_debut: oldDebut,
      old_fin: oldFin,
      date_debut: nextDebut,
      date_fin: nextFin,
    });
  }
  return rows;
}

export function propositionFromDelay(
  snapshot: PlanningSnapshot,
  result: Pick<DelayPlanResult, "message" | "patches" | "displacements">,
  extra?: { createChantier?: SignalementProposition["createChantier"] },
): SignalementProposition {
  const fromPatches = repercussionsFromPatches(snapshot, result.patches);
  const seen = new Set(fromPatches.map((row) => row.phase_id));
  for (const item of result.displacements) {
    for (const phase of item.phases) {
      if (seen.has(phase.phase_id)) continue;
      const employee = snapshot.employees.find((row) => row.id === phase.employe_id);
      fromPatches.push({
        phase_id: phase.phase_id,
        type_phase: phase.type_phase,
        nom_client: item.nom_client,
        nom_salarie: employee?.nom ?? "Non assigné",
        old_debut: phase.old_debut,
        old_fin: phase.old_fin,
        date_debut: phase.date_debut,
        date_fin: phase.date_fin,
      });
      seen.add(phase.phase_id);
    }
  }
  return {
    message: result.message,
    patches: result.patches,
    repercussions: fromPatches,
    createChantier: extra?.createChantier,
  };
}

export function absencePeriodNote(payload: Pick<NewAbsenceInput, "date_debut" | "date_fin">): string {
  return `Absence du ${payload.date_debut} au ${payload.date_fin}`;
}

export function matchingRecordedAbsence(
  snapshot: PlanningSnapshot,
  payload: NewAbsenceInput,
  ignoreAbsenceId?: string,
): Absence | undefined {
  return snapshot.absences.find(
    (item) =>
      item.id !== ignoreAbsenceId &&
      item.employe_id === payload.employe_id &&
      item.date_debut.slice(0, 10) === payload.date_debut &&
      item.date_fin.slice(0, 10) === payload.date_fin &&
      item.type === payload.type,
  );
}

export function similarAbsenceSignalement(
  snapshot: PlanningSnapshot,
  payload: NewAbsenceInput,
  statuts: Array<Signalement["statut"]> = ["en_attente"],
): Signalement | undefined {
  const needle = absencePeriodNote(payload);
  return (snapshot.signalements ?? []).find(
    (item) =>
      statuts.includes(item.statut) &&
      item.origine === "decalage_admin" &&
      item.employe_id === payload.employe_id &&
      (item.note ?? "").includes(needle),
  );
}

export function similarPendingAbsenceSignalement(
  snapshot: PlanningSnapshot,
  payload: NewAbsenceInput,
): Signalement | undefined {
  return similarAbsenceSignalement(snapshot, payload, ["en_attente"]);
}

function runSignalementsSelfCheck() {
  if (!needsAlgoValidation({ status: "conflict", displacements: [] })) {
    throw new Error("signalements: un conflit doit attendre une validation");
  }
  if (
    !needsAlgoValidation({
      status: "ok",
      displacements: [
        {
          chantier_id: "c2",
          nom_client: "Autre",
          priorite: "normal",
          working_days: 1,
          phases: [],
        },
      ],
    })
  ) {
    throw new Error("signalements: un décalage d’un autre chantier doit attendre");
  }
  if (needsAlgoValidation({ status: "ok", displacements: [] })) {
    throw new Error("signalements: sans répercussion externe, pas de file d’attente");
  }
  const snap = {
    employees: [],
    chantiers: [],
    elements: [],
    phases: [],
    absences: [
      {
        id: "a1",
        employe_id: "alexis",
        type: "conge" as const,
        date_debut: "2026-09-17",
        date_fin: "2026-09-18",
      },
    ],
    signalements: [
      {
        id: "s1",
        employe_id: "alexis",
        phase_id: "p1",
        retard_demi_journees: 1,
        sens: "retard" as const,
        note: "Absence du 2026-09-17 au 2026-09-18 : l’algorithme propose des décalages.",
        statut: "en_attente" as const,
        date_creation: "2026-09-14",
        origine: "decalage_admin" as const,
      },
    ],
    receptions: [],
    demandes: [],
    horaires: [],
  };
  const payload = {
    employe_id: "alexis",
    type: "conge" as const,
    date_debut: "2026-09-17",
    date_fin: "2026-09-18",
  };
  if (!matchingRecordedAbsence(snap, payload)) {
    throw new Error("signalements: absence déjà enregistrée non détectée");
  }
  if (!similarPendingAbsenceSignalement(snap, payload)) {
    throw new Error("signalements: signalement d’absence en attente non détecté");
  }
  if (
    similarPendingAbsenceSignalement(snap, {
      ...payload,
      date_debut: "2026-09-19",
      date_fin: "2026-09-20",
    })
  ) {
    throw new Error("signalements: autre période ne doit pas coller");
  }
  const snapRejected = {
    ...snap,
    signalements: snap.signalements.map((item) => ({
      ...item,
      statut: "rejete" as const,
    })),
  };
  if (similarPendingAbsenceSignalement(snapRejected, payload)) {
    throw new Error("signalements: un rejeté ne doit pas compter comme en attente");
  }
  if (!similarAbsenceSignalement(snapRejected, payload, ["rejete"])) {
    throw new Error("signalements: un rejeté pour les mêmes dates doit être détecté");
  }
}
runSignalementsSelfCheck();
