import { eachDayInclusive, isSunday, isoWeekday } from "@/lib/dates";
import type { TypePhase } from "@/lib/types";

export function scheduleChantierSlotDays(fromIso: string, toIso: string): string[] {
  return eachDayInclusive(fromIso, toIso).filter(
    (date) => !isSunday(date) && isoWeekday(date) !== 6,
  );
}

export function isUnplacedDatedPhase(phase: {
  date_debut: string | null;
  duree_estimee_heures: number;
  employe_id: string | null;
  type_phase: string;
}): boolean {
  if (!phase.date_debut) return false;
  if (Number(phase.duree_estimee_heures) <= 0) return true;
  if (phase.type_phase !== "logistique" && !phase.employe_id) return true;
  return false;
}

export function schedulePhaseInserts(
  elementId: string,
  typePhase: TypePhase,
  employeeId: string,
  days: string[],
) {
  const employeId = typePhase === "logistique" ? null : employeeId;
  return days.flatMap((date) => [
    {
      element_id: elementId,
      type_phase: typePhase,
      duree_estimee_heures: 4,
      date_debut: date,
      date_fin: date,
      heure_debut: "07:30",
      employe_id: employeId,
      statut: "a_faire" as const,
      urgent: false,
      heures_supplementaires_par_jour: 0,
    },
    {
      element_id: elementId,
      type_phase: typePhase,
      duree_estimee_heures: 3,
      date_debut: date,
      date_fin: date,
      heure_debut: "13:00",
      employe_id: employeId,
      statut: "a_faire" as const,
      urgent: false,
      heures_supplementaires_par_jour: 0,
    },
  ]);
}
