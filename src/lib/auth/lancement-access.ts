import { normalizePersonName } from "@/lib/auth/restore-access";

/** Alerte « Je valide le lancement » oublié : Jonathan et Mika. */
export function canReceiveLancementAlerts(
  nom: string | null | undefined,
): boolean {
  const key = normalizePersonName(nom ?? "");
  const first = key.split(/\s+/)[0] ?? "";
  return first === "jonathan" || first === "mika" || first === "michael";
}

function runLancementAccessSelfCheck() {
  if (
    !canReceiveLancementAlerts("Jonathan") ||
    !canReceiveLancementAlerts("Mika") ||
    !canReceiveLancementAlerts("Michael")
  ) {
    throw new Error("lancement-access: Jonathan et Mika doivent voir l’alerte");
  }
  if (canReceiveLancementAlerts("Alexis") || canReceiveLancementAlerts("Romain")) {
    throw new Error("lancement-access: Alexis et les salariés n’ont pas ce bandeau");
  }
}
runLancementAccessSelfCheck();
