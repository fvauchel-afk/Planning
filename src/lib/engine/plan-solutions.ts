import type { DelayPlanResult } from "@/lib/engine/delay";
import { planBestDelayInWindow } from "@/lib/engine/delay";
import {
  mergePlanIntoInput,
  planChantier,
  type Displacement,
  type PlanResult,
} from "@/lib/engine/planner";
import { solutionFingerprint } from "@/lib/engine/preview-solution";
import { chantierToleranceWorkingDays } from "@/lib/priorite";
import { propositionFromDelay } from "@/lib/signalements";
import type {
  NewChantierInput,
  PhasePatch,
  PlanningSnapshot,
  PlanningSolution,
  SignalementProposition,
} from "@/lib/types";

function patchesFromDisplacements(displacements: Displacement[]): PhasePatch[] {
  return displacements.flatMap((item) =>
    item.phases.map((phase) => ({
      id: phase.phase_id,
      date_debut: phase.date_debut,
      date_fin: phase.date_fin,
      employe_id: phase.employe_id,
    })),
  );
}

function solutionFromDelay(
  snapshot: PlanningSnapshot,
  result: Pick<DelayPlanResult, "message" | "patches" | "displacements">,
  title: string,
  extra?: { createChantier?: NewChantierInput },
): PlanningSolution {
  const proposition = propositionFromDelay(snapshot, result, extra);
  return {
    id: solutionFingerprint(proposition),
    title,
    message: proposition.message,
    patches: proposition.patches,
    repercussions: proposition.repercussions,
    createChantier: proposition.createChantier,
  };
}

function solutionFromPlan(
  snapshot: PlanningSnapshot,
  input: NewChantierInput,
  result: PlanResult,
  title: string,
  urgent: boolean,
): PlanningSolution {
  const merged = mergePlanIntoInput(input, result.phases, urgent);
  const patches = patchesFromDisplacements(result.displacements);
  return solutionFromDelay(
    snapshot,
    {
      message: result.message,
      patches,
      displacements: result.displacements,
    },
    title,
    { createChantier: merged },
  );
}

function pushUnique(list: PlanningSolution[], next: PlanningSolution) {
  if (!next.patches.length && !next.createChantier) return;
  if (list.some((item) => item.id === next.id)) return;
  list.push(next);
}

export function propositionFromSolutions(
  solutions: PlanningSolution[],
): SignalementProposition | null {
  if (!solutions.length) return null;
  const [first, ...rest] = solutions;
  return {
    message: first.message,
    patches: first.patches,
    repercussions: first.repercussions,
    createChantier: first.createChantier,
    alternatives: rest.length ? rest : undefined,
  };
}

export function allSolutionsOf(
  proposition: SignalementProposition | null | undefined,
): PlanningSolution[] {
  if (!proposition) return [];
  const first: PlanningSolution = {
    id: solutionFingerprint(proposition),
    title: proposition.message || "Solution 1",
    message: proposition.message,
    patches: proposition.patches,
    repercussions: proposition.repercussions,
    createChantier: proposition.createChantier,
  };
  const rest = (proposition.alternatives ?? []).filter(
    (item) => item.id !== first.id,
  );
  return [first, ...rest];
}

export function generatePlanSolutions(
  snapshot: PlanningSnapshot,
  input: NewChantierInput,
  primary: PlanResult,
  urgent: boolean,
): PlanningSolution[] {
  const solutions: PlanningSolution[] = [];
  if (primary.displacements.length || primary.phases.some((phase) => phase.date_debut)) {
    pushUnique(
      solutions,
      solutionFromPlan(
        snapshot,
        input,
        primary,
        primary.displacements.length
          ? "Déplacer les affaires moins prioritaires"
          : "Placement proposé",
        urgent,
      ),
    );
  }

  const squeezed = planChantier(snapshot, input, { urgent: true });
  if (squeezed.displacements.length || squeezed.status === "conflict") {
    pushUnique(
      solutions,
      solutionFromPlan(
        snapshot,
        input,
        squeezed,
        "Insérer en décalant Normal / Pas pressé (dans leur marge)",
        true,
      ),
    );
  }

  const withoutForcedDates: NewChantierInput = {
    ...input,
    elements: input.elements.map((element) => ({
      ...element,
      phases: element.phases.map((phase) => ({
        ...phase,
        date_debut: null,
        date_fin: null,
      })),
    })),
  };
  const appended = planChantier(snapshot, withoutForcedDates, { urgent: false });
  if (appended.status !== "blocked") {
    pushUnique(
      solutions,
      solutionFromPlan(
        snapshot,
        withoutForcedDates,
        appended,
        input.priorite === "prioritaire"
          ? "Placer à la suite (la date prioritaire ne serait plus tenue)"
          : "Placer à la suite, sans déplacer les autres",
        false,
      ),
    );
  }

  const pasPresseOnly = {
    ...squeezed,
    displacements: squeezed.displacements.filter(
      (item) => item.priorite === "pas_presse",
    ),
  };
  if (pasPresseOnly.displacements.length) {
    pushUnique(
      solutions,
      solutionFromPlan(
        snapshot,
        input,
        { ...squeezed, displacements: pasPresseOnly.displacements },
        "Ne déplacer que les chantiers « Pas pressé »",
        true,
      ),
    );
  }

  return solutions.slice(0, 5);
}

export function generateDelaySolutions(
  snapshot: PlanningSnapshot,
  phaseId: string,
  halfDays: number,
  primary: DelayPlanResult,
  options?: { scope?: "dependances" | "chantier"; target?: string; flex?: number },
): PlanningSolution[] {
  const origin = snapshot.phases.find((item) => item.id === phaseId);
  const solutions: PlanningSolution[] = [];
  pushUnique(
    solutions,
    solutionFromDelay(
      snapshot,
      primary,
      primary.status === "conflict"
        ? "Décalage demandé (touche une affaire plus prioritaire)"
        : "Décalage demandé",
    ),
  );

  const chantier = origin
    ? snapshot.chantiers.find((item) => {
        const element = snapshot.elements.find((row) => row.id === origin.element_id);
        return item.id === element?.chantier_id;
      })
    : undefined;
  const flex =
    options?.flex ??
    (options?.target && chantier ? chantierToleranceWorkingDays(chantier) : 0);
  if (origin?.date_debut && options?.target && flex >= 0) {
    const target = options.target;
    const windowed = planBestDelayInWindow(snapshot, phaseId, target, flex, {
      scope: options?.scope,
    });
    if (windowed.patches.length) {
      pushUnique(
        solutions,
        solutionFromDelay(
          snapshot,
          windowed,
          `Meilleur créneau dans la marge (± ${flex} j. ouvrés)`,
        ),
      );
    }
  }

  return solutions.slice(0, 5);
}
