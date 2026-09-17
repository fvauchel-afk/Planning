import { parisCalendarYmd } from "@/lib/dates";
import { fabricationAwaitingLaunch } from "@/lib/dates-estimatives";
import { isEmployeeAbsent } from "@/lib/engine/slots";
import type { PlanningSnapshot } from "@/lib/types";

export type LancementMailCible = {
  phaseId: string;
  chantierId: string;
  nomClient: string;
  employeId: string;
  employeNom: string;
  dateDebut: string;
  skipReason?: "absence" | "pas-aujourdhui" | "sans-salarie";
};

export function lancementMailCibles(
  snapshot: PlanningSnapshot,
  today = parisCalendarYmd(),
): LancementMailCible[] {
  const elementById = new Map(
    snapshot.elements.map((element) => [element.id, element]),
  );
  const chantierById = new Map(
    snapshot.chantiers.map((chantier) => [chantier.id, chantier]),
  );
  const employeeById = new Map(
    snapshot.employees.map((employee) => [employee.id, employee]),
  );
  const rows: LancementMailCible[] = [];
  for (const phase of snapshot.phases) {
    if (!fabricationAwaitingLaunch(phase, today)) continue;
    const start = phase.date_debut?.slice(0, 10);
    if (!start) continue;
    const element = elementById.get(phase.element_id);
    const chantier = element
      ? chantierById.get(element.chantier_id)
      : undefined;
    if (!chantier) continue;
    const employee = phase.employe_id
      ? employeeById.get(phase.employe_id)
      : undefined;
    if (!employee) {
      rows.push({
        phaseId: phase.id,
        chantierId: chantier.id,
        nomClient: chantier.nom_client,
        employeId: "",
        employeNom: "",
        dateDebut: start,
        skipReason: "sans-salarie",
      });
      continue;
    }
    if (start !== today) {
      rows.push({
        phaseId: phase.id,
        chantierId: chantier.id,
        nomClient: chantier.nom_client,
        employeId: employee.id,
        employeNom: employee.nom,
        dateDebut: start,
        skipReason: "pas-aujourdhui",
      });
      continue;
    }
    if (isEmployeeAbsent(snapshot, employee.id, today)) {
      rows.push({
        phaseId: phase.id,
        chantierId: chantier.id,
        nomClient: chantier.nom_client,
        employeId: employee.id,
        employeNom: employee.nom,
        dateDebut: start,
        skipReason: "absence",
      });
      continue;
    }
    rows.push({
      phaseId: phase.id,
      chantierId: chantier.id,
      nomClient: chantier.nom_client,
      employeId: employee.id,
      employeNom: employee.nom,
      dateDebut: start,
    });
  }
  return rows;
}

export function lancementMailsAEnvoyer(
  snapshot: PlanningSnapshot,
  today = parisCalendarYmd(),
): LancementMailCible[] {
  return lancementMailCibles(snapshot, today).filter((row) => !row.skipReason);
}

function runLancementMailSelfCheck() {
  const snapshot: PlanningSnapshot = {
    employees: [
      { id: "e1", nom: "Romain", roles: ["fabrication"], actif: true },
    ],
    chantiers: [
      {
        id: "c1",
        nom_client: "Portail",
        adresse: "",
        lien_dossier_onedrive: null,
        priorite: "normal",
        date_creation: "2026-09-01",
      },
    ],
    elements: [{ id: "el1", chantier_id: "c1", nom_element: "Portail" }],
    phases: [
      {
        id: "p1",
        element_id: "el1",
        type_phase: "fabrication",
        duree_estimee_heures: 8,
        date_debut: "2026-09-17",
        date_fin: "2026-09-17",
        employe_id: "e1",
        statut: "a_faire",
        urgent: false,
        lancement_valide: false,
      },
    ],
    absences: [],
    signalements: [],
    receptions: [],
    demandes: [],
    horaires: [],
  };
  const send = lancementMailsAEnvoyer(snapshot, "2026-09-17");
  if (send.length !== 1 || send[0]?.employeNom !== "Romain") {
    throw new Error("lancement-mail: envoyer le jour J au fabricant");
  }
  const absent = lancementMailsAEnvoyer(
    {
      ...snapshot,
      absences: [
        {
          id: "a1",
          employe_id: "e1",
          date_debut: "2026-09-17",
          date_fin: "2026-09-17",
          type: "conge",
        },
      ],
    },
    "2026-09-17",
  );
  if (absent.length !== 0) {
    throw new Error("lancement-mail: pas d’e-mail si le salarié est en congé");
  }
  const overdue = lancementMailsAEnvoyer(snapshot, "2026-09-18");
  if (overdue.length !== 0) {
    throw new Error("lancement-mail: l’e-mail part seulement le jour du début");
  }
}
runLancementMailSelfCheck();
