import { extraAutoPoseurCount, pickDistinctEmployeesForPhase } from "@/lib/engine/phase-chain";
import type { NewChantierInput, PlanningSnapshot } from "@/lib/types";

/** Poseurs nommés en plus du 1er, puis N poseurs auto libres (hors déjà pris). */
export function extraPoseurIdsAfterChain(
  snapshot: PlanningSnapshot,
  input: NewChantierInput,
  namedPoseurIds: string[],
  extraAuto: number,
): string[] {
  const named = namedPoseurIds.filter(Boolean);
  const pose = input.elements
    .flatMap((element) => element.phases)
    .find((phase) => phase.type_phase === "pose");
  const taken = new Set(named);
  if (pose?.employe_id) taken.add(pose.employe_id);
  const autos = pickDistinctEmployeesForPhase(
    snapshot,
    "pose",
    pose?.date_debut ?? null,
    pose?.date_fin ?? pose?.date_debut ?? null,
    extraAutoPoseurCount(named.length, extraAuto),
    taken,
  );
  return [...named.slice(1), ...autos];
}
