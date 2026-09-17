import type { NewChantierInput, TypePhase } from "@/lib/types";

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
}
runCreatePhasesSelfCheck();
