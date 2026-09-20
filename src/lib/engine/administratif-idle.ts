import { addDays, formatIsoFr, parisCalendarYmd } from "@/lib/dates";
import { employeeWorksOnDate, hoursForSlot } from "@/lib/engine/hours";
import { isEmployeeAbsent } from "@/lib/engine/slots";
import { LOGISTIQUE_ROW_ID, TRANSPORT_ROW_ID } from "@/lib/types";
import { ADMINISTRATIF_IDLE_KIND, parseProposition } from "@/lib/signalements";
import type {
  Employee,
  NewChantierInput,
  PlanningSnapshot,
  SignalementProposition,
} from "@/lib/types";

export const ADMINISTRATIF_IDLE_DAYS = 7;

export type AdministratifIdlePlan = {
  employeeId: string;
  employeeNom: string;
  from: string;
  to: string;
  freeDays: string[];
  input: NewChantierInput;
  proposition: SignalementProposition;
};

/**
 * Un creux atelier ne se comble pas en Administratif si ce n’est pas le rôle
 * du salarié. Jonathan / Mika (administratif seul) n’ont souvent aucune phase
 * chantier : ce n’est pas un oubli à remplir.
 */
export function canProposeAdministratifIdle(employee: Employee): boolean {
  if (!employee.actif) return false;
  if (employee.id === LOGISTIQUE_ROW_ID || employee.id === TRANSPORT_ROW_ID) {
    return false;
  }
  if (!employee.roles.includes("administratif")) return false;
  return employee.roles.includes("fabrication") || employee.roles.includes("pose");
}

function phaseTouchesWindow(
  dateDebut: string | null | undefined,
  dateFin: string | null | undefined,
  from: string,
  to: string,
): boolean {
  const start = dateDebut?.slice(0, 10) || null;
  if (!start) return false;
  const end = (dateFin || dateDebut)?.slice(0, 10) || start;
  return start <= to && end >= from;
}

export function employeeHasChantierInWindow(
  snapshot: PlanningSnapshot,
  employeeId: string,
  from: string,
  to: string,
): boolean {
  return snapshot.phases.some(
    (phase) =>
      phase.employe_id === employeeId &&
      phaseTouchesWindow(phase.date_debut, phase.date_fin, from, to),
  );
}

export function freeWorkingDaysInWindow(
  snapshot: PlanningSnapshot,
  employee: Employee,
  from: string,
  to: string,
): string[] {
  const days: string[] = [];
  let cursor = from;
  while (cursor <= to) {
    if (
      employeeWorksOnDate(snapshot, employee, cursor) &&
      !isEmployeeAbsent(snapshot, employee.id, cursor)
    ) {
      days.push(cursor);
    }
    cursor = addDays(cursor, 1);
  }
  return days;
}

function contiguousRanges(days: string[]): Array<{ start: string; end: string; days: string[] }> {
  if (days.length === 0) return [];
  const ranges: Array<{ start: string; end: string; days: string[] }> = [];
  let current: string[] = [days[0]!];
  for (let i = 1; i < days.length; i += 1) {
    const prev = current[current.length - 1]!;
    const next = days[i]!;
    if (addDays(prev, 1) === next) {
      current.push(next);
    } else {
      ranges.push({ start: current[0]!, end: current[current.length - 1]!, days: current });
      current = [next];
    }
  }
  ranges.push({ start: current[0]!, end: current[current.length - 1]!, days: current });
  return ranges;
}

function hoursOnDays(
  snapshot: PlanningSnapshot,
  employeeId: string,
  days: string[],
): number {
  let total = 0;
  for (const date of days) {
    total += hoursForSlot(snapshot, employeeId, date, 0);
    total += hoursForSlot(snapshot, employeeId, date, 1);
  }
  return Math.round(total * 2) / 2;
}

export function buildAdministratifChantierInput(
  snapshot: PlanningSnapshot,
  employee: Employee,
  freeDays: string[],
): NewChantierInput {
  const ranges = contiguousRanges(freeDays);
  return {
    nom_client: `Administratif — ${employee.nom}`,
    adresse: "",
    lien_dossier_onedrive: null,
    priorite: "pas_presse",
    dates_estimatives: true,
    avec_pose: false,
    avec_thermolaquage: false,
    avec_livraison: false,
    date_debut: freeDays[0] ?? null,
    date_fin: freeDays[freeDays.length - 1] ?? null,
    elements: ranges.map((range, index) => ({
      nom_element: ranges.length > 1 ? `Administratif ${index + 1}` : "Administratif",
      phases: [
        {
          type_phase: "administratif",
          duree_estimee_heures: Math.max(1, hoursOnDays(snapshot, employee.id, range.days)),
          date_debut: range.start,
          date_fin: range.end,
          heure_debut: "07:30",
          employe_id: employee.id,
          urgent: false,
        },
      ],
    })),
  };
}

export function alreadySuggestedAdministratif(
  snapshot: PlanningSnapshot,
  employeeId: string,
  from: string,
): boolean {
  return (snapshot.signalements ?? []).some((item) => {
    if (item.employe_id !== employeeId) return false;
    const proposition = parseProposition(item.proposition);
    if (proposition?.kind !== ADMINISTRATIF_IDLE_KIND) return false;
    if (item.statut !== "en_attente" && item.statut !== "rejete") return false;
    if (proposition.from === from) return true;
    return (
      item.statut === "rejete" &&
      typeof proposition.to === "string" &&
      proposition.to >= from
    );
  });
}

export function administratifIdlePlans(
  snapshot: PlanningSnapshot,
  today = parisCalendarYmd(),
): AdministratifIdlePlan[] {
  const from = today;
  const to = addDays(today, ADMINISTRATIF_IDLE_DAYS - 1);
  const plans: AdministratifIdlePlan[] = [];
  for (const employee of snapshot.employees) {
    if (!canProposeAdministratifIdle(employee)) continue;
    if (employeeHasChantierInWindow(snapshot, employee.id, from, to)) continue;
    const freeDays = freeWorkingDaysInWindow(snapshot, employee, from, to);
    if (freeDays.length === 0) continue;
    if (alreadySuggestedAdministratif(snapshot, employee.id, from)) continue;
    const input = buildAdministratifChantierInput(snapshot, employee, freeDays);
    const message = `${employee.nom} n’a aucun chantier du ${formatIsoFr(from)} au ${formatIsoFr(to)}. Bloc Administratif ajouté les jours libres (${freeDays.map(formatIsoFr).join(", ")}).`;
    const proposition: SignalementProposition = {
      kind: ADMINISTRATIF_IDLE_KIND,
      from,
      to,
      message,
      patches: [],
      repercussions: [],
      createChantier: input,
    };
    plans.push({
      employeeId: employee.id,
      employeeNom: employee.nom,
      from,
      to,
      freeDays,
      input,
      proposition,
    });
  }
  return plans;
}

function emptySnapshot(employees: Employee[], signalements: unknown[] = []) {
  return {
    employees,
    chantiers: [],
    elements: [],
    phases: [],
    absences: [],
    signalements,
    receptions: [],
    demandes: [],
    horaires: [],
  } as unknown as PlanningSnapshot;
}

function runAdministratifIdleSelfCheck() {
  const atelier: Employee = {
    id: "emp-romain",
    nom: "Romain",
    roles: ["fabrication", "pose"],
    actif: true,
  };
  const bureau: Employee = {
    id: "emp-jonathan",
    nom: "Jonathan",
    roles: ["administratif"],
    actif: true,
  };
  const mixte: Employee = {
    id: "emp-mixte",
    nom: "Mixte",
    roles: ["fabrication", "pose", "administratif"],
    actif: true,
  };
  const today = "2026-09-21";
  if (administratifIdlePlans(emptySnapshot([atelier]), today).length !== 0) {
    throw new Error("administratif-idle: un poseur/fabricant ne doit pas être calé en Administratif");
  }
  if (administratifIdlePlans(emptySnapshot([bureau]), today).length !== 0) {
    throw new Error("administratif-idle: un salarié uniquement administratif n’est pas un creux atelier");
  }
  const plans = administratifIdlePlans(emptySnapshot([mixte]), today);
  if (plans.length !== 1) {
    throw new Error("administratif-idle: un salarié atelier + administratif sans chantier doit proposer");
  }
  if (plans[0]?.proposition.kind !== ADMINISTRATIF_IDLE_KIND) {
    throw new Error("administratif-idle: kind de proposition");
  }
  if (!plans[0]?.input.elements[0]?.phases.some((phase) => phase.type_phase === "administratif")) {
    throw new Error("administratif-idle: chantier Administratif manquant");
  }
  const busy = {
    ...emptySnapshot([mixte]),
    phases: [
      {
        id: "ph-1",
        element_id: "el-1",
        type_phase: "fabrication",
        duree_estimee_heures: 8,
        date_debut: "2026-09-22",
        date_fin: "2026-09-22",
        employe_id: "emp-mixte",
        statut: "a_faire",
        urgent: false,
      },
    ],
  } as unknown as PlanningSnapshot;
  if (administratifIdlePlans(busy, today).length !== 0) {
    throw new Error("administratif-idle: un chantier dans la fenêtre ne doit pas proposer");
  }
  const dismissed = emptySnapshot([mixte], [
    {
      employe_id: "emp-mixte",
      statut: "rejete",
      proposition: {
        kind: ADMINISTRATIF_IDLE_KIND,
        from: "2026-09-20",
        to: "2026-09-26",
        message: "",
        patches: [],
        repercussions: [],
      },
    },
  ]);
  if (administratifIdlePlans(dismissed, today).length !== 0) {
    throw new Error("administratif-idle: un refus doit tenir jusqu’à la fin des 7 jours");
  }
}

runAdministratifIdleSelfCheck();
