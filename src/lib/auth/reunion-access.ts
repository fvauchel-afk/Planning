import { normalizePersonName } from "@/lib/auth/restore-access";

/** Sujets de réunion de direction : Jonathan et Mika (Michael). */
export function canManageReunionDirection(
  nom: string | null | undefined,
): boolean {
  const first = normalizePersonName(nom ?? "").split(/\s+/)[0] ?? "";
  return first === "jonathan" || first === "mika" || first === "michael";
}

function runReunionAccessSelfCheck() {
  if (
    !canManageReunionDirection("Jonathan") ||
    !canManageReunionDirection("Mika") ||
    !canManageReunionDirection("Michael")
  ) {
    throw new Error("reunion-access: Jonathan et Mika doivent gérer la réunion");
  }
  if (
    canManageReunionDirection("Alexis") ||
    canManageReunionDirection("Romain") ||
    canManageReunionDirection("Ethan")
  ) {
    throw new Error("reunion-access: un salarié ou Alexis ne doit pas y accéder");
  }
}
runReunionAccessSelfCheck();
