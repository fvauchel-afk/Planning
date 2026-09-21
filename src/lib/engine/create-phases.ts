import {
  daysFromPhaseHours,
  hoursFromDayPreset,
} from "@/lib/engine/duree-presets";
import type { NewChantierInput, PlanningSnapshot, TypePhase } from "@/lib/types";

/** Une phase par type, sauf la pose : plusieurs poseurs = plusieurs phases pose. */
export function phasesForCreate<T extends { type_phase: TypePhase }>(
  phases: T[],
): T[] {
  const firstByType = new Map<TypePhase, T>();
  const extraPose: T[] = [];
  for (const phase of phases) {
    if (phase.type_phase === "pose" && firstByType.has("pose")) {
      extraPose.push(phase);
      continue;
    }
    firstByType.set(phase.type_phase, phase);
  }
  return [...Array.from(firstByType.values()), ...extraPose];
}

export function expandPosePhases<
  T extends { type_phase: TypePhase; employe_id: string | null },
>(phases: T[], extraPoseurIds: string[]): T[] {
  if (extraPoseurIds.length === 0) return phases;
  const pose = phases.find((phase) => phase.type_phase === "pose");
  if (!pose) return phases;
  const taken = new Set(
    phases
      .filter((phase) => phase.type_phase === "pose")
      .map((phase) => phase.employe_id)
      .filter(Boolean),
  );
  const extras = extraPoseurIds
    .filter((id) => id && !taken.has(id))
    .map((id) => ({ ...pose, employe_id: id }));
  return extras.length ? [...phases, ...extras] : phases;
}

export function withExtraPoseurs(
  input: NewChantierInput,
  extraPoseurIds: string[],
): NewChantierInput {
  if (!input.avec_pose || extraPoseurIds.length === 0) return input;
  return {
    ...input,
    elements: input.elements.map((element) => ({
      ...element,
      phases: expandPosePhases(element.phases, extraPoseurIds),
    })),
  };
}

/** Poseurs choisis dans le tableau Élément (plusieurs par élément, heures selon le contrat). */
export function withPoseursPerElement(
  snapshot: PlanningSnapshot,
  input: NewChantierInput,
  poseurIdsByElement: string[][],
  fromDate?: string | null,
): NewChantierInput {
  if (!input.avec_pose) return input;
  return {
    ...input,
    elements: input.elements.map((element, index) => {
      const ids = (poseurIdsByElement[index] ?? []).filter(Boolean);
      const pose = element.phases.find((phase) => phase.type_phase === "pose");
      const rawHours = Number(pose?.duree_estimee_heures) || 0;
      const primary = ids[0] ?? pose?.employe_id ?? null;
      const extras = ids.slice(1);
      if (rawHours <= 0) {
        const phases = element.phases.map((phase) =>
          phase.type_phase === "pose" ? { ...phase, employe_id: primary } : phase,
        );
        return { ...element, phases: expandPosePhases(phases, extras) };
      }
      const days = daysFromPhaseHours(
        snapshot,
        pose?.employe_id ?? ids[0] ?? null,
        rawHours,
        fromDate || pose?.date_debut,
      );
      const phases = element.phases.map((phase) => {
        if (phase.type_phase !== "pose") return phase;
        return {
          ...phase,
          employe_id: primary,
          duree_estimee_heures: hoursFromDayPreset(
            snapshot,
            primary,
            days,
            fromDate || phase.date_debut,
          ),
        };
      });
      return {
        ...element,
        phases: expandPosePhases(phases, extras).map((phase) => {
          if (phase.type_phase !== "pose") return phase;
          return {
            ...phase,
            duree_estimee_heures: hoursFromDayPreset(
              snapshot,
              phase.employe_id,
              days,
              fromDate || phase.date_debut,
            ),
          };
        }),
      };
    }),
  };
}

function runCreatePhasesSelfCheck() {
  const rows = phasesForCreate([
    { type_phase: "fabrication" as const, id: "f" },
    { type_phase: "pose" as const, id: "p1" },
    { type_phase: "pose" as const, id: "p2" },
    { type_phase: "fabrication" as const, id: "f2" },
  ]);
  if (rows.length !== 3) {
    throw new Error("create-phases: garder une fabrication et deux poses");
  }
  if (rows.filter((row) => row.type_phase === "pose").length !== 2) {
    throw new Error("create-phases: les deux poseurs doivent être conservés");
  }
  const expanded = expandPosePhases(
    [{ type_phase: "pose" as const, employe_id: "a" }],
    ["a", "b"],
  );
  if (expanded.length !== 2 || expanded[1]?.employe_id !== "b") {
    throw new Error("create-phases: le 2e poseur est copié sur une phase pose");
  }
  const perEl = withPoseursPerElement(
    {
      employees: [],
      chantiers: [],
      elements: [],
      phases: [],
      absences: [],
      signalements: [],
      receptions: [],
      demandes: [],
      horaires: [],
    },
    {
      nom_client: "X",
      adresse: "",
      lien_dossier_onedrive: null,
      priorite: "normal",
      avec_pose: true,
      elements: [
        {
          nom_element: "Pergola",
          phases: [
            {
              type_phase: "pose",
              duree_estimee_heures: 7.5,
              date_debut: null,
              date_fin: null,
              employe_id: null,
              urgent: false,
            },
          ],
        },
      ],
    },
    [["a", "b"]],
  );
  const poses = perEl.elements[0]?.phases.filter((row) => row.type_phase === "pose");
  if (poses?.length !== 2 || poses[0]?.employe_id !== "a" || poses[1]?.employe_id !== "b") {
    throw new Error("create-phases: poseurs distincts par élément");
  }
}
runCreatePhasesSelfCheck();
