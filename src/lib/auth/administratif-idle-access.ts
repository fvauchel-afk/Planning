import { normalizePersonName } from "@/lib/auth/restore-access";

/** Création manuelle d’un bloc Administratif : Jonathan, Mika (Michael) et Alexis. */
export function canManageAdministratifIdle(
  nom: string | null | undefined,
): boolean {
  const first = normalizePersonName(nom ?? "").split(/\s+/)[0] ?? "";
  return (
    first === "jonathan" ||
    first === "mika" ||
    first === "michael" ||
    first === "alexis"
  );
}

function runAdministratifIdleAccessSelfCheck() {
  if (
    !canManageAdministratifIdle("Jonathan") ||
    !canManageAdministratifIdle("Mika") ||
    !canManageAdministratifIdle("Michael") ||
    !canManageAdministratifIdle("Alexis")
  ) {
    throw new Error(
      "administratif-idle-access: Jonathan, Mika et Alexis doivent pouvoir créer",
    );
  }
  if (canManageAdministratifIdle("Romain") || canManageAdministratifIdle("Ethan")) {
    throw new Error("administratif-idle-access: un salarié ne doit pas créer");
  }
}
runAdministratifIdleAccessSelfCheck();
