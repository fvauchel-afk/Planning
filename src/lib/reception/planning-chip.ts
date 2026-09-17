import type { TypePhase } from "@/lib/types";

export function planningReceptionChipLabel(phase: {
  type_phase: TypePhase | string;
  statut: string;
}): string | null {
  if (phase.statut === "termine") return null;
  if (phase.type_phase === "pose") return "Terminer / réception";
  if (phase.type_phase === "livraison") {
    return "Faire signer le bon de livraison";
  }
  return null;
}

function runPlanningChipSelfCheck() {
  const pose = planningReceptionChipLabel({
    type_phase: "pose",
    statut: "a_faire",
  });
  if (pose !== "Terminer / réception") {
    throw new Error("planning-chip: le bloc Pose doit proposer Terminer / réception");
  }
  const livraison = planningReceptionChipLabel({
    type_phase: "livraison",
    statut: "a_faire",
  });
  if (livraison !== "Faire signer le bon de livraison") {
    throw new Error(
      "planning-chip: le bloc Livraison doit proposer Faire signer le bon de livraison",
    );
  }
  if (
    planningReceptionChipLabel({
      type_phase: "livraison",
      statut: "termine",
    }) !== null
  ) {
    throw new Error("planning-chip: une livraison terminée ne doit plus proposer la signature");
  }
  if (
    planningReceptionChipLabel({
      type_phase: "fabrication",
      statut: "a_faire",
    }) !== null
  ) {
    throw new Error("planning-chip: fabrication ne doit pas afficher le bouton réception");
  }
}

runPlanningChipSelfCheck();
