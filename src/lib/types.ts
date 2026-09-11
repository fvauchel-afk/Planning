export const ROLES = [
  "administratif",
  "fabrication",
  "pose",
  "logistique",
] as const;
export type Role = (typeof ROLES)[number];

export const PRIORITES = ["prioritaire", "normal", "pas_presse"] as const;
export type Priorite = (typeof PRIORITES)[number];

export const TYPES_PHASE = [
  "administratif",
  "fabrication",
  "logistique",
  "pose",
] as const;
export type TypePhase = (typeof TYPES_PHASE)[number];

export const STATUTS_PHASE = ["a_faire", "en_cours", "termine"] as const;
export type StatutPhase = (typeof STATUTS_PHASE)[number];

export const TYPES_ABSENCE = [
  "conge",
  "maladie",
  "ferie_entreprise",
  "formation",
  "autre",
] as const;
export type TypeAbsence = (typeof TYPES_ABSENCE)[number];

export const JOURS_OUVRES = [1, 2, 3, 4, 5, 6] as const;
export type JourOuvre = (typeof JOURS_OUVRES)[number];

export const JOUR_OUVRE_LABELS: Record<JourOuvre, string> = {
  1: "Lundi",
  2: "Mardi",
  3: "Mercredi",
  4: "Jeudi",
  5: "Vendredi",
  6: "Samedi",
};

export type HorairesJour = {
  embauche: string;
  pause_debut: string;
  pause_reprise: string;
  debouche: string;
};

export type HorairesSaisonEmploye = {
  jours: Record<string, HorairesJour>;
};

export type HorairesEmploye = {
  ete: HorairesSaisonEmploye;
  hiver: HorairesSaisonEmploye;
};

export type HoraireSaison = {
  id: string;
  nom: string;
  debut_mmdd: string;
  fin_mmdd: string;
  ordre: number;
};

export type Employee = {
  id: string;
  nom: string;
  roles: Role[];
  actif: boolean;
  horaires?: HorairesEmploye | null;
  is_admin?: boolean;
};

export type Chantier = {
  id: string;
  nom_client: string;
  adresse: string;
  lien_dossier_onedrive: string | null;
  priorite: Priorite;
  date_creation: string;
};

export type ElementChantier = {
  id: string;
  chantier_id: string;
  nom_element: string;
};

export type PhasePlanning = {
  id: string;
  element_id: string;
  type_phase: TypePhase;
  duree_estimee_heures: number;
  date_debut: string | null;
  date_fin: string | null;
  heure_debut?: string | null;
  employe_id: string | null;
  statut: StatutPhase;
  urgent: boolean;
  heures_supplementaires_par_jour?: number;
};

export type Absence = {
  id: string;
  employe_id: string;
  date_debut: string;
  date_fin: string;
  type: TypeAbsence;
  motif_precision?: string | null;
};

export const STATUTS_SIGNALEMENT = ["en_attente", "valide", "rejete"] as const;
export type StatutSignalement = (typeof STATUTS_SIGNALEMENT)[number];

export const SENS_SIGNALEMENT = ["retard", "avance"] as const;
export type SensSignalement = (typeof SENS_SIGNALEMENT)[number];

export const ORIGINES_SIGNALEMENT = ["salarie", "decalage_admin"] as const;
export type OrigineSignalement = (typeof ORIGINES_SIGNALEMENT)[number];

export type Signalement = {
  id: string;
  employe_id: string;
  phase_id: string;
  retard_demi_journees: number;
  sens: SensSignalement;
  note: string;
  statut: StatutSignalement;
  date_creation: string;
  origine: OrigineSignalement;
};

export type NewSignalementInput = {
  employe_id: string;
  phase_id: string;
  retard_demi_journees: number;
  sens: SensSignalement;
  note: string;
  origine?: OrigineSignalement;
  statut?: StatutSignalement;
};

export type ReceptionChantier = {
  id: string;
  phase_id: string;
  nom_signataire: string;
  image_signature: string;
  date_signature: string;
  onedrive_erreur?: string | null;
};

export type NewReceptionInput = {
  phase_id: string;
  nom_signataire: string;
  image_signature: string;
};

export type PlanningSnapshot = {
  employees: Employee[];
  chantiers: Chantier[];
  elements: ElementChantier[];
  phases: PhasePlanning[];
  absences: Absence[];
  signalements: Signalement[];
  receptions: ReceptionChantier[];
  horaires: HoraireSaison[];
};

export type NewElementInput = {
  nom_element: string;
  phases: {
    type_phase: TypePhase;
    duree_estimee_heures: number;
    date_debut: string | null;
    date_fin: string | null;
    heure_debut?: string | null;
    employe_id: string | null;
    urgent: boolean;
    heures_supplementaires_par_jour?: number;
  }[];
};

export type NewChantierInput = {
  nom_client: string;
  adresse: string;
  lien_dossier_onedrive: string | null;
  priorite: Priorite;
  elements: NewElementInput[];
};

export type NewEmployeeInput = {
  nom: string;
  roles: Role[];
  actif: boolean;
  horaires?: HorairesEmploye | null;
  is_admin?: boolean;
  pin?: string;
};

export type NewAbsenceInput = {
  employe_id: string;
  date_debut: string;
  date_fin: string;
  type: TypeAbsence;
  motif_precision?: string | null;
};

export type PhasePatch = {
  id: string;
  date_debut: string | null;
  date_fin: string | null;
  employe_id: string | null;
  heure_debut?: string | null;
};

export const ROLE_LABELS: Record<Role, string> = {
  administratif: "Administratif",
  fabrication: "Fabrication",
  pose: "Pose",
  logistique: "Logistique",
};

export const PHASE_LABELS: Record<TypePhase, string> = {
  administratif: "Administratif",
  fabrication: "Fabrication",
  logistique: "Logistique",
  pose: "Pose",
};

export const PRIORITE_LABELS: Record<Priorite, string> = {
  prioritaire: "Prioritaire",
  normal: "Normal",
  pas_presse: "Pas pressé",
};

export const STATUT_LABELS: Record<StatutPhase, string> = {
  a_faire: "À faire",
  en_cours: "En cours",
  termine: "Terminé",
};

export const ABSENCE_LABELS: Record<TypeAbsence, string> = {
  conge: "Congé",
  maladie: "Arrêt maladie",
  ferie_entreprise: "Jour férié entreprise",
  formation: "Formation",
  autre: "Autre",
};

export function absenceLabel(
  absence: Pick<Absence, "type" | "motif_precision">,
): string {
  if (absence.type === "autre" && absence.motif_precision?.trim()) {
    return `Autre — ${absence.motif_precision.trim()}`;
  }
  return ABSENCE_LABELS[absence.type] ?? absence.type;
}

export const SIGNALEMENT_LABELS: Record<StatutSignalement, string> = {
  en_attente: "En attente",
  valide: "Validé",
  rejete: "Rejeté",
};

export const SENS_LABELS: Record<SensSignalement, string> = {
  retard: "Retard",
  avance: "Avance",
};

export const ORIGINE_LABELS: Record<OrigineSignalement, string> = {
  salarie: "Signalement salarié",
  decalage_admin: "Décalage admin",
};

export const LOGISTIQUE_ROW_ID = "logistique-sous-traitance";
