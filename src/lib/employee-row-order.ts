import { LOGISTIQUE_ROW_ORDRE, employeeOrdre } from "@/lib/display-order";
import { LOGISTIQUE_ROW_ID, type Employee } from "@/lib/types";

/** Salariés placés visuellement sous la ligne Thermolaquage. */
export const EMPLOYEE_ORDER_AFTER_LOGISTICS = 1000;

/**
 * Anciens ordres (ex. Raphaël = 9) restent sous Thermolaquage (8)
 * jusqu’à un enregistrement qui bascule vers 1000+.
 */
export function employeeOrdreForPlanning(employee: Employee): number {
  const n = employeeOrdre(employee);
  if (n > LOGISTIQUE_ROW_ORDRE && n < EMPLOYEE_ORDER_AFTER_LOGISTICS) {
    return n + EMPLOYEE_ORDER_AFTER_LOGISTICS;
  }
  return n;
}

export function persistEmployeeOrdersFromVisualRowIds(visualIds: string[]): {
  id: string;
  ordre_affichage: number;
}[] {
  const logiIdx = visualIds.indexOf(LOGISTIQUE_ROW_ID);
  const updates: { id: string; ordre_affichage: number }[] = [];
  let before = 1;
  let after = EMPLOYEE_ORDER_AFTER_LOGISTICS;
  visualIds.forEach((id, index) => {
    if (id === LOGISTIQUE_ROW_ID) return;
    if (logiIdx >= 0 && index > logiIdx) {
      updates.push({ id, ordre_affichage: after });
      after += 1;
    } else {
      updates.push({ id, ordre_affichage: before });
      before += 1;
    }
  });
  return updates;
}
