const JOURS_COURTS = ["dim.", "lun.", "mar.", "mer.", "jeu.", "ven.", "sam."];
const MOIS_COURTS = [
  "janv.",
  "févr.",
  "mars",
  "avr.",
  "mai",
  "juin",
  "juil.",
  "août",
  "sept.",
  "oct.",
  "nov.",
  "déc.",
];

export function toISODate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Jour calendaire Europe/Paris (YYYY-MM-DD), indépendant du fuseau du serveur. */
export function parisCalendarYmd(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Paris",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

export function parseISODate(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}

export function addDays(iso: string, days: number): string {
  const date = parseISODate(iso);
  date.setDate(date.getDate() + days);
  return toISODate(date);
}

export function calendarDaysBetween(fromIso: string, toIso: string): number {
  const from = parseISODate(fromIso);
  const to = parseISODate(toIso);
  return Math.round((to.getTime() - from.getTime()) / 86400000);
}

export function startOfWeekMonday(date: Date): Date {
  const copy = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const day = copy.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  copy.setDate(copy.getDate() + diff);
  return copy;
}

export function eachDay(fromIso: string, count: number): string[] {
  return Array.from({ length: count }, (_, i) => addDays(fromIso, i));
}

export function eachDayInclusive(fromIso: string, toIso: string): string[] {
  const start = fromIso <= toIso ? fromIso : toIso;
  const end = fromIso <= toIso ? toIso : fromIso;
  const days: string[] = [];
  let cursor = start;
  while (cursor <= end) {
    days.push(cursor);
    cursor = addDays(cursor, 1);
  }
  return days;
}

export function formatDayHeader(iso: string): { weekday: string; date: string } {
  const date = parseISODate(iso);
  return {
    weekday: JOURS_COURTS[date.getDay()],
    date: `${date.getDate()} ${MOIS_COURTS[date.getMonth()]}`,
  };
}

export function formatLongDate(iso: string): string {
  const date = parseISODate(iso);
  return `${JOURS_COURTS[date.getDay()]} ${date.getDate()} ${MOIS_COURTS[date.getMonth()]} ${date.getFullYear()}`;
}

export function formatIsoFr(iso: string): string {
  const [year, month, day] = iso.slice(0, 10).split("-");
  if (!year || !month || !day) return iso;
  return `${day}/${month}/${year}`;
}

export function isWeekend(iso: string): boolean {
  const day = parseISODate(iso).getDay();
  return day === 0 || day === 6;
}

export function isSunday(iso: string): boolean {
  return parseISODate(iso).getDay() === 0;
}

/** Lundi = 1 … dimanche = 7. */
export function isoWeekday(iso: string): number {
  const day = parseISODate(iso).getDay();
  return day === 0 ? 7 : day;
}

export function datesOverlap(
  startA: string,
  endA: string,
  startB: string,
  endB: string,
): boolean {
  return startA <= endB && startB <= endA;
}

export function dateInRange(iso: string, start: string, end: string): boolean {
  return iso >= start && iso <= end;
}

export function nextWorkingDay(iso: string): string {
  let cursor = addDays(iso, 1);
  while (isWeekend(cursor)) {
    cursor = addDays(cursor, 1);
  }
  return cursor;
}

/** `n` jours ouvrés après `iso` (week-end exclus, `iso` non compté). `n` peut être négatif. */
export function addWorkingDays(iso: string, n: number): string {
  if (n === 0) return iso;
  if (n < 0) {
    let cursor = iso;
    let left = -n;
    while (left > 0) {
      cursor = addDays(cursor, -1);
      if (!isWeekend(cursor)) left -= 1;
    }
    return cursor;
  }
  let cursor = iso;
  let added = 0;
  while (added < n) {
    cursor = addDays(cursor, 1);
    if (!isWeekend(cursor)) added += 1;
  }
  return cursor;
}

/** Plus petit entier relatif `s` tel que `addWorkingDays(from, s) >= target`. */
export function shiftToReach(from: string, target: string): number {
  if (target === from) return 0;
  if (target > from) return workingDaysBetween(from, target);
  return -workingDaysBetween(target, from);
}

export function workingDaysBetween(startIso: string, endIso: string): number {
  if (endIso <= startIso) return 0;
  let count = 0;
  let cursor = addDays(startIso, 1);
  while (cursor <= endIso) {
    if (!isWeekend(cursor)) count += 1;
    cursor = addDays(cursor, 1);
  }
  return count;
}

export const CHANTIER_DUREE_JOURS_MAX = 15;

export function normalizeDureeJours(jours: number): number {
  return Math.max(1, Math.round(Number(jours) || 1));
}

/** Fin de chantier : N jours ouvrés à partir du début (1 jour = le jour même). */
export function chantierEndFromDureeJours(debut: string, jours: number): string {
  if (!debut) return "";
  return addWorkingDays(debut, normalizeDureeJours(jours) - 1);
}

export function dureeJoursFromChantierRange(debut: string, fin: string): number {
  if (!debut) return 1;
  const end = fin && fin >= debut ? fin : debut;
  return Math.max(1, 1 + workingDaysBetween(debut, end));
}

export function formatDureeJoursLabel(jours: number): string {
  if (jours === 0.5) return "0,5 jour";
  if (jours === 1) return "1 jour";
  if (jours === 1.5) return "1,5 jour";
  return `${jours} jours`;
}

/** 0,5 / 1 / 1,5 / 2–15, plus la durée actuelle si elle n’est pas dans la liste. */
export function dureeJoursMenuValues(current?: number | null): number[] {
  const values = [0.5, 1, 1.5];
  for (let n = 2; n <= CHANTIER_DUREE_JOURS_MAX; n += 1) values.push(n);
  const extra = Number(current);
  if (
    Number.isFinite(extra) &&
    extra > 0 &&
    !values.some((item) => Math.abs(item - extra) < 0.001)
  ) {
    values.push(extra);
    values.sort((a, b) => a - b);
  }
  return values;
}

function runChantierDureeSelfCheck() {
  if (chantierEndFromDureeJours("2026-09-21", 1) !== "2026-09-21") {
    throw new Error("dates: 1 jour = le lundi même");
  }
  if (chantierEndFromDureeJours("2026-09-21", 5) !== "2026-09-25") {
    throw new Error("dates: 5 jours ouvrés dès lundi = vendredi");
  }
  if (chantierEndFromDureeJours("2026-09-21", 7) !== "2026-09-29") {
    throw new Error("dates: 7 jours ouvrés dès lundi saute le week-end");
  }
  if (dureeJoursFromChantierRange("2026-09-21", "2026-09-25") !== 5) {
    throw new Error("dates: lun–ven = 5 jours");
  }
  if (chantierEndFromDureeJours("2026-09-21", 18) !== "2026-10-14") {
    throw new Error("dates: 18 jours ouvrés dès lundi ne sont pas coupés à 15");
  }
  if (dureeJoursFromChantierRange("2026-09-21", "2026-10-14") !== 18) {
    throw new Error("dates: plage > 15 jours conservée");
  }
  const menu = dureeJoursMenuValues(18);
  if (!menu.includes(0.5) || !menu.includes(1.5) || menu[menu.length - 1] !== 18) {
    throw new Error("dates: le menu a 0,5 / 1,5 et garde l’option au-delà de 15");
  }
}
runChantierDureeSelfCheck();


export function startOfWeekIso(iso: string): string {
  return toISODate(startOfWeekMonday(parseISODate(iso)));
}

export function startOfMonthIso(iso: string): string {
  const date = parseISODate(iso);
  return toISODate(new Date(date.getFullYear(), date.getMonth(), 1));
}

export function endOfMonthIso(iso: string): string {
  const date = parseISODate(iso);
  return toISODate(new Date(date.getFullYear(), date.getMonth() + 1, 0));
}

export function addMonths(iso: string, months: number): string {
  const date = parseISODate(iso);
  const day = date.getDate();
  const next = new Date(date.getFullYear(), date.getMonth() + months, 1);
  const last = new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate();
  next.setDate(Math.min(day, last));
  return toISODate(next);
}

const JOURS_LONGS = [
  "dimanche",
  "lundi",
  "mardi",
  "mercredi",
  "jeudi",
  "vendredi",
  "samedi",
];

const MOIS_LONGS = [
  "janvier",
  "février",
  "mars",
  "avril",
  "mai",
  "juin",
  "juillet",
  "août",
  "septembre",
  "octobre",
  "novembre",
  "décembre",
];

export function formatMonthYear(iso: string): string {
  const date = parseISODate(iso);
  return `${MOIS_LONGS[date.getMonth()]} ${date.getFullYear()}`;
}

/** Ex. « jeudi 10 septembre » (sans l’année). */
export function formatDisplayedDay(iso: string): string {
  const date = parseISODate(iso);
  return `${JOURS_LONGS[date.getDay()]} ${date.getDate()} ${MOIS_LONGS[date.getMonth()]}`;
}

export function compareIso(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

export function formatOvertimeHours(hours: number): string {
  const rounded = Math.round(hours * 10) / 10;
  const body = Number.isInteger(rounded)
    ? String(rounded)
    : rounded.toFixed(1).replace(".", ",");
  return `+${body}h`;
}
