/**
 * Restauration des sauvegardes : uniquement Jonathan et Mika.
 * (Michael est accepté si c’est le nom enregistré pour Mika.)
 */
export function normalizePersonName(nom: string): string {
  return nom
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

export function canRestorePlanning(nom: string | null | undefined): boolean {
  const key = normalizePersonName(nom ?? "");
  return key === "jonathan" || key === "mika" || key === "michael";
}

export const RESTORE_CONFIRM_PHRASE = "REMPLACER";

function runRestoreAccessSelfCheck() {
  if (!canRestorePlanning("Jonathan") || !canRestorePlanning("Mika")) {
    throw new Error("restore-access: Jonathan et Mika doivent pouvoir restaurer");
  }
  if (!canRestorePlanning("Michael")) {
    throw new Error("restore-access: Michael (Mika) doit pouvoir restaurer");
  }
  if (canRestorePlanning("Alexis") || canRestorePlanning("Romain")) {
    throw new Error("restore-access: les autres comptes ne doivent pas restaurer");
  }
}
runRestoreAccessSelfCheck();
