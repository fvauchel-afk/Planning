import { addDays, isoWeekday, isSunday } from "@/lib/dates";
import {
  JOURS_OUVRES,
  type Employee,
  type HoraireSaison,
  type HorairesEmploye,
  type HorairesJour,
  type HorairesSaisonEmploye,
  type PlanningSnapshot,
} from "@/lib/types";

/** Même id que `LOGISTIQUE_ROW_ID` dans types — import local pour éviter un cycle de bundle. */
const LOGISTICS_ROW_ID = "logistique-sous-traitance";

export function emptyHorairesJour(): HorairesJour {
  return {
    embauche: "",
    pause_debut: "",
    pause_reprise: "",
    debouche: "",
  };
}

function jourSemaine(
  embauche: string,
  pauseDebut: string,
  pauseReprise: string,
  debouche: string,
): HorairesJour {
  return {
    embauche,
    pause_debut: pauseDebut,
    pause_reprise: pauseReprise,
    debouche,
  };
}

let cachedDefaultEte: HorairesSaisonEmploye | null = null;
let cachedDefaultHiver: HorairesSaisonEmploye | null = null;

function stockSaison(kind: "ete" | "hiver"): HorairesSaisonEmploye {
  if (kind === "ete") {
    return (cachedDefaultEte ??= defaultHorairesSaisonEmploye("ete"));
  }
  return (cachedDefaultHiver ??= defaultHorairesSaisonEmploye("hiver"));
}

export function defaultHorairesSaisonEmploye(
  kind: "ete" | "hiver",
  options?: { skipWednesday?: boolean },
): HorairesSaisonEmploye {
  const week =
    kind === "ete"
      ? jourSemaine("07:30", "12:00", "13:00", "16:00")
      : jourSemaine("08:00", "12:00", "13:00", "17:00");
  const friday =
    kind === "ete"
      ? jourSemaine("07:30", "12:00", "", "")
      : jourSemaine("08:00", "12:00", "", "");
  const jours: Record<string, HorairesJour> = {};
  for (const day of JOURS_OUVRES) {
    if (day === 6 || (options?.skipWednesday && day === 3)) {
      jours[String(day)] = emptyHorairesJour();
    } else if (day === 5) {
      jours[String(day)] = { ...friday };
    } else {
      jours[String(day)] = { ...week };
    }
  }
  return { jours };
}

export function defaultHorairesEmploye(options?: {
  skipWednesday?: boolean;
}): HorairesEmploye {
  return {
    ete: defaultHorairesSaisonEmploye("ete", options),
    hiver: defaultHorairesSaisonEmploye("hiver", options),
  };
}

export function emptyHorairesEmploye(): HorairesEmploye {
  return {
    ete: stockSaison("ete"),
    hiver: stockSaison("hiver"),
  };
}

function normalizeJour(raw: unknown): HorairesJour {
  const row = (raw ?? {}) as Record<string, unknown>;
  const asTime = (value: unknown) => (typeof value === "string" ? value : "");
  return {
    embauche: asTime(row.embauche),
    pause_debut: asTime(row.pause_debut),
    pause_reprise: asTime(row.pause_reprise),
    debouche: asTime(row.debouche),
  };
}

function normalizeSaisonEmploye(
  raw: HorairesSaisonEmploye | null | undefined,
  fallback: HorairesSaisonEmploye,
): HorairesSaisonEmploye {
  const jours: Record<string, HorairesJour> = {};
  for (const day of JOURS_OUVRES) {
    const key = String(day);
    jours[key] = raw?.jours?.[key]
      ? normalizeJour(raw.jours[key])
      : normalizeJour(fallback.jours[key]);
  }
  return { jours };
}

export function normalizeHorairesEmploye(
  raw: HorairesEmploye | null | undefined,
): HorairesEmploye {
  const fallbackEte = stockSaison("ete");
  const fallbackHiver = stockSaison("hiver");
  if (!raw) {
    return { ete: fallbackEte, hiver: fallbackHiver };
  }
  return {
    ete: normalizeSaisonEmploye(raw.ete, fallbackEte),
    hiver: normalizeSaisonEmploye(raw.hiver, fallbackHiver),
  };
}

export function defaultHoraires(): HoraireSaison[] {
  return [
    {
      id: "horaire-ete",
      nom: "Été",
      debut_mmdd: "06-01",
      fin_mmdd: "09-30",
      ordre: 0,
    },
    {
      id: "horaire-hiver",
      nom: "Hiver",
      debut_mmdd: "10-01",
      fin_mmdd: "05-31",
      ordre: 1,
    },
  ];
}

export function normalizeHoraire(row: HoraireSaison): HoraireSaison {
  return {
    id: row.id,
    nom: row.nom,
    debut_mmdd: row.debut_mmdd,
    fin_mmdd: row.fin_mmdd,
    ordre: Number(row.ordre) || 0,
  };
}

export function horairesOf(snapshot: PlanningSnapshot): HoraireSaison[] {
  const rows = snapshot.horaires ?? [];
  return rows.length > 0 ? rows.map(normalizeHoraire) : defaultHoraires();
}

function monthDay(iso: string): string {
  return iso.slice(5, 10);
}

function inYearlyRange(md: string, start: string, end: string): boolean {
  if (start <= end) return md >= start && md <= end;
  return md >= start || md <= end;
}

export function saisonForDate(
  snapshot: PlanningSnapshot,
  date: string,
): HoraireSaison {
  const runtime = runtimeFor(snapshot);
  const md = monthDay(date);
  const cached = runtime.saisonByMd.get(md);
  if (cached) return cached;
  const match = runtime.saisons.find((row) =>
    inYearlyRange(md, row.debut_mmdd, row.fin_mmdd),
  );
  const saison =
    match ??
    ({
      id: "horaire-defaut",
      nom: "Hiver",
      debut_mmdd: "01-01",
      fin_mmdd: "12-31",
      ordre: 99,
    } satisfies HoraireSaison);
  runtime.saisonByMd.set(md, saison);
  return saison;
}

export function saisonKind(saison: HoraireSaison): "ete" | "hiver" {
  const nom = (saison.nom ?? "").toLowerCase();
  if (nom.includes("été") || nom.includes("ete") || saison.ordre === 0) {
    return "ete";
  }
  return "hiver";
}

export function minutesFromTime(value: unknown): number | null {
  const text = typeof value === "string" ? value.trim() : "";
  const match = /^(\d{1,2}):(\d{2})$/.exec(text);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}

export function formatClock(minutes: number): string {
  const h = Math.floor(Math.max(0, minutes) / 60);
  const m = Math.round(minutes % 60);
  return `${String(h).padStart(2, "0")}h${String(m).padStart(2, "0")}`;
}

export function timeFromMinutes(minutes: number): string {
  const h = Math.floor(Math.max(0, minutes) / 60);
  const m = Math.round(minutes % 60);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function parseMinutes(value: unknown): number | null {
  return minutesFromTime(value);
}

export function hoursBetween(start: string, end: string): number {
  const from = parseMinutes(start);
  const to = parseMinutes(end);
  if (from == null || to == null || to <= from) return 0;
  return Math.round(((to - from) / 60) * 100) / 100;
}

export function hoursFromJour(
  jour: HorairesJour | null | undefined,
  half: 0 | 1,
): number {
  if (!jour) return 0;
  const morning = hoursBetween(jour.embauche, jour.pause_debut);
  const afternoon = hoursBetween(jour.pause_reprise, jour.debouche);
  if (morning > 0 || afternoon > 0) {
    return half === 0 ? morning : afternoon;
  }
  const continuous = hoursBetween(jour.embauche, jour.debouche);
  if (continuous <= 0) return 0;
  return half === 0 ? continuous : 0;
}

export function dayHoursFromJour(jour: HorairesJour): number {
  return (
    Math.round(
      (hoursFromJour(jour, 0) + hoursFromJour(jour, 1)) * 100,
    ) / 100
  );
}

export function formatHoursLabel(hours: number): string {
  const rounded = Math.round(hours * 100) / 100;
  const text = Number.isInteger(rounded)
    ? String(rounded)
    : String(rounded).replace(".", ",");
  return `${text} h`;
}

export type WorkWindow = {
  start: number;
  end: number;
  half: 0 | 1;
};

type HoursRuntime = {
  employeeById: Map<string, Employee>;
  holidays: { start: string; end: string }[];
  offByEmployee: Map<string, { start: string; end: string }[]>;
  saisons: HoraireSaison[];
  saisonByMd: Map<string, HoraireSaison>;
  horairesByEmployee: Map<string, HorairesEmploye>;
  hours: Map<string, number>;
  windows: Map<string, WorkWindow[]>;
};

const hoursRuntime = new WeakMap<PlanningSnapshot, HoursRuntime>();

function runtimeFor(snapshot: PlanningSnapshot): HoursRuntime {
  const cached = hoursRuntime.get(snapshot);
  if (cached) return cached;
  const holidays: HoursRuntime["holidays"] = [];
  const offByEmployee = new Map<string, { start: string; end: string }[]>();
  for (const absence of snapshot.absences) {
    const span = { start: absence.date_debut, end: absence.date_fin };
    if (absence.type === "ferie_entreprise") {
      holidays.push(span);
      continue;
    }
    const list = offByEmployee.get(absence.employe_id) ?? [];
    list.push(span);
    offByEmployee.set(absence.employe_id, list);
  }
  const next: HoursRuntime = {
    employeeById: new Map(
      snapshot.employees.map((employee) => [employee.id, employee]),
    ),
    holidays,
    offByEmployee,
    saisons: [...horairesOf(snapshot)].sort((a, b) => a.ordre - b.ordre),
    saisonByMd: new Map(),
    horairesByEmployee: new Map(),
    hours: new Map(),
    windows: new Map(),
  };
  hoursRuntime.set(snapshot, next);
  return next;
}

function isHolidayDate(runtime: HoursRuntime, date: string): boolean {
  return runtime.holidays.some(
    (span) => date >= span.start && date <= span.end,
  );
}

function isOffDate(
  runtime: HoursRuntime,
  employeeId: string,
  date: string,
): boolean {
  const list = runtime.offByEmployee.get(employeeId);
  if (!list) return false;
  return list.some((span) => date >= span.start && date <= span.end);
}

function horairesOfEmployee(
  runtime: HoursRuntime,
  employee: Employee,
): HorairesEmploye {
  const cached = runtime.horairesByEmployee.get(employee.id);
  if (cached) return cached;
  const horaires =
    employee.horaires?.ete?.jours && employee.horaires?.hiver?.jours
      ? employee.horaires
      : normalizeHorairesEmploye(employee.horaires);
  runtime.horairesByEmployee.set(employee.id, horaires);
  return horaires;
}

function jourForEmployee(
  snapshot: PlanningSnapshot,
  employee: Employee,
  date: string,
): HorairesJour {
  const weekday = isoWeekday(date);
  if (weekday === 7) return emptyHorairesJour();
  const runtime = runtimeFor(snapshot);
  const kind = saisonKind(saisonForDate(snapshot, date));
  const horaires = horairesOfEmployee(runtime, employee);
  return horaires[kind].jours[String(weekday)] ?? emptyHorairesJour();
}

export function employeeWorksHalf(
  snapshot: PlanningSnapshot,
  employee: Employee | null | undefined,
  date: string,
  half: 0 | 1,
): boolean {
  if (!employee) return false;
  return hoursFromJour(jourForEmployee(snapshot, employee, date), half) > 0;
}

export function employeeWorksOnDate(
  snapshot: PlanningSnapshot,
  employee: Employee | null | undefined,
  date: string,
): boolean {
  return (
    employeeWorksHalf(snapshot, employee, date, 0) ||
    employeeWorksHalf(snapshot, employee, date, 1)
  );
}

export function employeeAvailableOnRange(
  snapshot: PlanningSnapshot,
  employee: Employee | null | undefined,
  from: string | null | undefined,
  to?: string | null,
): boolean {
  if (!employee) return false;
  if (!from) return true;
  const end = to || from;
  let date = from;
  let guard = 0;
  while (date <= end && guard < 400) {
    guard += 1;
    if (employeeWorksOnDate(snapshot, employee, date)) return true;
    date = addDays(date, 1);
  }
  return false;
}

function logisticsHalfHours(
  snapshot: PlanningSnapshot,
  date: string,
  half: 0 | 1,
): number {
  const weekday = isoWeekday(date);
  if (weekday === 7) return 0;
  const kind = saisonKind(saisonForDate(snapshot, date));
  const jour = stockSaison(kind).jours[String(weekday)] ?? emptyHorairesJour();
  return hoursFromJour(jour, half);
}

export function hoursForSlot(
  snapshot: PlanningSnapshot,
  rowId: string,
  date: string,
  half: 0 | 1,
): number {
  const runtime = runtimeFor(snapshot);
  const key = `${rowId}|${date}|${half}`;
  const cached = runtime.hours.get(key);
  if (cached !== undefined) return cached;
  let hours = 0;
  if (!isSunday(date) && !isHolidayDate(runtime, date)) {
    if (rowId === LOGISTICS_ROW_ID) {
      hours = logisticsHalfHours(snapshot, date, half);
    } else {
      const employee = runtime.employeeById.get(rowId);
      if (employee?.actif) {
        hours = hoursFromJour(jourForEmployee(snapshot, employee, date), half);
      }
    }
  }
  runtime.hours.set(key, hours);
  return hours;
}

export function workWindowsForRow(
  snapshot: PlanningSnapshot,
  rowId: string,
  date: string,
): WorkWindow[] {
  const runtime = runtimeFor(snapshot);
  const key = `${rowId}|${date}`;
  const cached = runtime.windows.get(key);
  if (cached) return cached;
  if (hoursForSlot(snapshot, rowId, date, 0) <= 0 && hoursForSlot(snapshot, rowId, date, 1) <= 0) {
    runtime.windows.set(key, []);
    return [];
  }
  if (rowId !== LOGISTICS_ROW_ID && isOffDate(runtime, rowId, date)) {
    runtime.windows.set(key, []);
    return [];
  }
  const employee = runtime.employeeById.get(rowId);
  if (rowId !== LOGISTICS_ROW_ID && !employee) {
    runtime.windows.set(key, []);
    return [];
  }
  const jour =
    rowId === LOGISTICS_ROW_ID
      ? stockSaison(saisonKind(saisonForDate(snapshot, date))).jours[
          String(isoWeekday(date))
        ] ?? emptyHorairesJour()
      : jourForEmployee(snapshot, employee as Employee, date);
  const morningStart = minutesFromTime(jour.embauche);
  const morningEnd = minutesFromTime(jour.pause_debut);
  const afternoonStart = minutesFromTime(jour.pause_reprise);
  const afternoonEnd = minutesFromTime(jour.debouche);
  const windows: WorkWindow[] = [];
  if (morningStart != null && morningEnd != null && morningEnd > morningStart) {
    windows.push({ start: morningStart, end: morningEnd, half: 0 });
  }
  if (
    afternoonStart != null &&
    afternoonEnd != null &&
    afternoonEnd > afternoonStart
  ) {
    windows.push({ start: afternoonStart, end: afternoonEnd, half: 1 });
  }
  if (windows.length === 0) {
    const start = minutesFromTime(jour.embauche);
    const end = minutesFromTime(jour.debouche);
    if (start != null && end != null && end > start) {
      windows.push({ start, end, half: 0 });
    }
  }
  runtime.windows.set(key, windows);
  return windows;
}

export function hoursInSlots(
  snapshot: PlanningSnapshot,
  slots: { rowId: string; date: string; half: 0 | 1; startMin?: number; endMin?: number }[],
): number {
  return slots.reduce((total, slot) => {
    if (slot.startMin != null && slot.endMin != null) {
      return total + (slot.endMin - slot.startMin) / 60;
    }
    return total + hoursForSlot(snapshot, slot.rowId, slot.date, slot.half);
  }, 0);
}

export function dayCapacityHours(
  snapshot: PlanningSnapshot,
  employee: Employee,
  date: string,
): number {
  if (!employee.actif) return 0;
  return (
    hoursForSlot(snapshot, employee.id, date, 0) +
    hoursForSlot(snapshot, employee.id, date, 1)
  );
}

export function capacityHoursForWeek(
  snapshot: PlanningSnapshot,
  weekStart: string,
  employeeIds?: string[],
): number {
  const ids = employeeIds ? new Set(employeeIds) : null;
  let hours = 0;
  for (const employee of snapshot.employees) {
    if (!employee.actif) continue;
    if (ids && !ids.has(employee.id)) continue;
    for (let i = 0; i < 7; i += 1) {
      const date = addDays(weekStart, i);
      if (isOffDate(runtimeFor(snapshot), employee.id, date)) continue;
      hours += dayCapacityHours(snapshot, employee, date);
    }
  }
  return Math.round(hours * 10) / 10;
}

export function formatMmddInput(mmdd: string): string {
  const match = /^(\d{2})-(\d{2})$/.exec(mmdd);
  if (!match) return "";
  return `2000-${match[1]}-${match[2]}`;
}

export function mmddFromInput(value: string): string {
  if (/^\d{2}-\d{2}$/.test(value)) return value;
  if (value.length >= 10) return value.slice(5, 10);
  return "";
}
