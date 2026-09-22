import {
  CRENEAUX_ABSENCE,
  type CreneauAbsence,
} from "@/lib/types";

export { CRENEAUX_ABSENCE, type CreneauAbsence };

export const CRENEAU_ABSENCE_LABELS: Record<CreneauAbsence, string> = {
  journee: "Journée entière",
  matin: "Matin",
  apres_midi: "Après-midi",
  heures: "Heures précises",
};

export type AbsenceCreneauFields = {
  date_debut: string;
  date_fin: string;
  creneau?: CreneauAbsence | null;
  duree_heures?: number | null;
  type?: string | null;
};

export function parseCreneauAbsence(value: unknown): CreneauAbsence {
  if (
    typeof value === "string" &&
    (CRENEAUX_ABSENCE as readonly string[]).includes(value)
  ) {
    return value as CreneauAbsence;
  }
  return "journee";
}

export function parseDureeHeures(value: unknown): number | null {
  if (value == null || value === "") return null;
  const hours = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(hours)) return null;
  return Math.round(hours * 100) / 100;
}

export function normalizeAbsenceCreneau(
  input: Pick<AbsenceCreneauFields, "creneau" | "duree_heures" | "type">,
): { creneau: CreneauAbsence; duree_heures: number | null } {
  if (input.type === "ferie_entreprise") {
    return { creneau: "journee", duree_heures: null };
  }
  const creneau = parseCreneauAbsence(input.creneau);
  if (creneau !== "heures") return { creneau, duree_heures: null };
  return { creneau, duree_heures: parseDureeHeures(input.duree_heures) };
}

export function creneauPersistFields(
  input: Pick<AbsenceCreneauFields, "creneau" | "duree_heures" | "type">,
): { creneau: CreneauAbsence; duree_heures: number | null } {
  return normalizeAbsenceCreneau(input);
}

export function validateAbsenceCreneau(
  input: Pick<AbsenceCreneauFields, "creneau" | "duree_heures" | "type">,
): string | null {
  const { creneau, duree_heures } = normalizeAbsenceCreneau(input);
  if (creneau !== "heures") return null;
  if (duree_heures == null || duree_heures <= 0) {
    return "Indiquez le nombre d’heures d’absence.";
  }
  if (duree_heures > 12) {
    return "Le nombre d’heures d’absence ne peut pas dépasser 12 h.";
  }
  return null;
}

export function absenceCoversDate(
  absence: Pick<AbsenceCreneauFields, "date_debut" | "date_fin">,
  date: string,
): boolean {
  const debut = absence.date_debut.slice(0, 10);
  const fin = absence.date_fin.slice(0, 10);
  return date >= debut && date <= fin;
}

function roundHours(value: number): number {
  return Math.round(value * 100) / 100;
}

/** Heures retirées sur une demi-journée, matin d’abord pour le créneau « heures ». */
export function hoursTakenOnHalf(
  items: AbsenceCreneauFields[],
  date: string,
  half: 0 | 1,
  morningHours: number,
  afternoonHours: number,
): number {
  let morningLeft = Math.max(0, morningHours);
  let afternoonLeft = Math.max(0, afternoonHours);
  for (const item of items) {
    if (!absenceCoversDate(item, date)) continue;
    if (item.type === "ferie_entreprise") {
      morningLeft = 0;
      afternoonLeft = 0;
      continue;
    }
    const { creneau, duree_heures } = normalizeAbsenceCreneau(item);
    if (creneau === "journee") {
      morningLeft = 0;
      afternoonLeft = 0;
    } else if (creneau === "matin") {
      morningLeft = 0;
    } else if (creneau === "apres_midi") {
      afternoonLeft = 0;
    } else {
      let need = Math.max(0, duree_heures ?? 0);
      const fromMorning = Math.min(need, morningLeft);
      morningLeft -= fromMorning;
      need -= fromMorning;
      const fromAfternoon = Math.min(need, afternoonLeft);
      afternoonLeft -= fromAfternoon;
    }
  }
  if (half === 0) return roundHours(Math.max(0, morningHours - morningLeft));
  return roundHours(Math.max(0, afternoonHours - afternoonLeft));
}

export function remainingHoursOnHalf(
  items: AbsenceCreneauFields[],
  date: string,
  half: 0 | 1,
  morningHours: number,
  afternoonHours: number,
): number {
  const contract = half === 0 ? morningHours : afternoonHours;
  const taken = hoursTakenOnHalf(items, date, half, morningHours, afternoonHours);
  return roundHours(Math.max(0, contract - taken));
}

export function isFullDayAbsenceBlock(
  items: AbsenceCreneauFields[],
  date: string,
  morningHours: number,
  afternoonHours: number,
): boolean {
  const remaining =
    remainingHoursOnHalf(items, date, 0, morningHours, afternoonHours) +
    remainingHoursOnHalf(items, date, 1, morningHours, afternoonHours);
  return remaining <= 0.0001 && morningHours + afternoonHours > 0;
}

export function formatCreneauCourt(
  input: Pick<AbsenceCreneauFields, "creneau" | "duree_heures" | "type">,
): string | null {
  const { creneau, duree_heures } = normalizeAbsenceCreneau(input);
  if (creneau === "journee") return null;
  if (creneau === "matin") return "matin";
  if (creneau === "apres_midi") return "après-midi";
  const hours = duree_heures ?? 0;
  const label = Number.isInteger(hours) ? `${hours}` : String(hours).replace(".", ",");
  return `${label} h`;
}

export function formatCreneauTable(
  input: Pick<AbsenceCreneauFields, "creneau" | "duree_heures" | "type">,
): string {
  const court = formatCreneauCourt(input);
  return court ?? "Journée";
}

function runAbsenceCreneauSelfCheck() {
  const matin: AbsenceCreneauFields = {
    date_debut: "2026-09-22",
    date_fin: "2026-09-22",
    creneau: "matin",
    type: "conge",
  };
  if (hoursTakenOnHalf([matin], "2026-09-22", 0, 4, 3) !== 4) {
    throw new Error("absence-creneau: le matin doit tout prendre le matin");
  }
  if (hoursTakenOnHalf([matin], "2026-09-22", 1, 4, 3) !== 0) {
    throw new Error("absence-creneau: le matin ne doit pas bloquer l’après-midi");
  }
  if (isFullDayAbsenceBlock([matin], "2026-09-22", 4, 3)) {
    throw new Error("absence-creneau: un matin n’est pas une journée entière");
  }
  const heures: AbsenceCreneauFields = {
    date_debut: "2026-09-22",
    date_fin: "2026-09-24",
    creneau: "heures",
    duree_heures: 2,
    type: "conge",
  };
  if (hoursTakenOnHalf([heures], "2026-09-23", 0, 4, 3) !== 2) {
    throw new Error("absence-creneau: 2 h se déduisent d’abord le matin, chaque jour");
  }
  if (hoursTakenOnHalf([heures], "2026-09-23", 1, 4, 3) !== 0) {
    throw new Error("absence-creneau: 2 h ne doivent pas manger l’après-midi");
  }
  const longues: AbsenceCreneauFields = {
    ...heures,
    duree_heures: 5,
  };
  if (hoursTakenOnHalf([longues], "2026-09-22", 0, 4, 3) !== 4) {
    throw new Error("absence-creneau: 5 h doivent vider le matin");
  }
  if (hoursTakenOnHalf([longues], "2026-09-22", 1, 4, 3) !== 1) {
    throw new Error("absence-creneau: le reliquat des 5 h tombe l’après-midi");
  }
  if (validateAbsenceCreneau({ creneau: "heures", duree_heures: null })) {
    // ok: message attendu
  } else {
    throw new Error("absence-creneau: heures sans durée doit être invalide");
  }
  if (validateAbsenceCreneau({ creneau: "matin" })) {
    throw new Error("absence-creneau: matin sans durée doit être valide");
  }
  if (parseCreneauAbsence(undefined) !== "journee") {
    throw new Error("absence-creneau: ancien enregistrement = journée");
  }
}
runAbsenceCreneauSelfCheck();
