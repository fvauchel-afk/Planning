/** Ordre de la ligne Thermolaquage (ex-Logistique) dans le planning équipe. */
export const LOGISTIQUE_ROW_ORDRE = 8;
export const LOGISTIQUE_ROW_LABEL = "Thermolaquage";

const ORDRE_PAR_PRENOM: Record<string, number> = {
  jonathan: 1,
  mika: 2,
  alexis: 3,
  romain: 4,
  louison: 5,
  ethan: 6,
  quentin: 7,
  raphael: 9,
};

export function prenomKey(nom: string): string {
  const cleaned = nom.replace(/\([^)]*\)/g, " ").trim();
  const first = cleaned.split(/\s+/)[0] || nom.trim();
  return first
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

export function ordreAffichageFromNom(nom: string): number {
  return ORDRE_PAR_PRENOM[prenomKey(nom)] ?? 100;
}

export function employeeOrdre(employee: {
  nom: string;
  ordre_affichage?: number | null;
}): number {
  if (
    typeof employee.ordre_affichage === "number" &&
    Number.isFinite(employee.ordre_affichage)
  ) {
    return employee.ordre_affichage;
  }
  return ordreAffichageFromNom(employee.nom);
}

export function compareEmployeesByOrdre(
  left: { nom: string; ordre_affichage?: number | null },
  right: { nom: string; ordre_affichage?: number | null },
): number {
  const delta = employeeOrdre(left) - employeeOrdre(right);
  if (delta !== 0) return delta;
  return left.nom.localeCompare(right.nom, "fr");
}
