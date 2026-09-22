import {
  listImpactedPhases,
  planAbsenceImprevue,
  type AbsencePhaseChoice,
} from "@/lib/engine/absence-imprevue";
import { delayTouchesPrioritaire } from "@/lib/engine/delay";
import type { DelayPlanResult } from "@/lib/engine/delay";
import {
  absencePeriodNote,
  matchingRecordedAbsence,
  propositionFromDelay,
  similarAbsenceSignalement,
  similarPendingAbsenceSignalement,
} from "@/lib/signalements";
import type {
  NewAbsenceInput,
  NewSignalementInput,
  PhasePatch,
  PlanningSnapshot,
} from "@/lib/types";

export type ApplyRecordedAbsenceResult =
  | { kind: "conflict"; plan: DelayPlanResult }
  | { kind: "pending_similar" }
  | { kind: "ok"; viaSignalement: boolean; resentAfterReject: boolean };

export async function applyRecordedAbsence(input: {
  snapshot: PlanningSnapshot;
  payload: NewAbsenceInput;
  choices: Record<string, AbsencePhaseChoice>;
  forceConflict?: boolean;
  previousConflict?: DelayPlanResult | null;
  createAbsence: (payload: NewAbsenceInput) => Promise<void>;
  applyPhasePatches: (patches: PhasePatch[]) => Promise<void>;
  createSignalement: (payload: NewSignalementInput) => Promise<void>;
}): Promise<ApplyRecordedAbsenceResult> {
  const plan =
    input.forceConflict && input.previousConflict
      ? input.previousConflict
      : planAbsenceImprevue(input.snapshot, input.payload, input.choices);
  const needsPlacementConflict =
    plan.status === "conflict" ||
    delayTouchesPrioritaire(input.snapshot, plan.patches);
  if (needsPlacementConflict && !input.forceConflict) {
    return { kind: "conflict", plan };
  }
  const overlap = listImpactedPhases(
    input.snapshot,
    input.payload.employe_id,
    input.payload.date_debut,
    input.payload.date_fin,
    input.payload,
  );
  if (needsPlacementConflict) {
    if (similarPendingAbsenceSignalement(input.snapshot, input.payload)) {
      return { kind: "pending_similar" };
    }
    const already = matchingRecordedAbsence(input.snapshot, input.payload);
    if (!already) {
      await input.createAbsence(input.payload);
    }
    const previouslyRejected = similarAbsenceSignalement(
      input.snapshot,
      input.payload,
      ["rejete"],
    );
    const originPhaseId = overlap[0]?.phase.id ?? plan.patches[0]?.id ?? "";
    await input.createSignalement({
      employe_id: input.payload.employe_id,
      phase_id: originPhaseId || null,
      retard_demi_journees: 1,
      sens: "retard",
      note: `${absencePeriodNote(input.payload)} : l’algorithme propose des décalages, non appliqués tant que Mika ou Alexis n’a pas validé.`,
      origine: "decalage_admin",
      statut: "en_attente",
      proposition: propositionFromDelay(input.snapshot, plan),
    });
    return {
      kind: "ok",
      viaSignalement: true,
      resentAfterReject: Boolean(previouslyRejected),
    };
  }
  const already = matchingRecordedAbsence(input.snapshot, input.payload);
  if (!already) {
    await input.createAbsence(input.payload);
  }
  if (plan.patches.length > 0) {
    await input.applyPhasePatches(plan.patches);
  }
  return { kind: "ok", viaSignalement: false, resentAfterReject: false };
}
