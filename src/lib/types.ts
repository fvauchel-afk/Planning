import type { StatutCommande } from "@/lib/commandes";
import type { LigneFourniture } from "@/lib/fournitures";
import type { LigneBonCommande } from "@/lib/bon-commande/lignes";
import type { FinitionLaquage } from "@/lib/thermolaquage";
import type { PieceJointe } from "@/lib/pieces-jointes";

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
  "livraison",
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
  ordre_affichage?: number;
};

export type SousTraitant = {
  id: string;
  nom: string;
  specialite: string;
  email: string;
  telephone?: string | null;
  adresse?: string | null;
};

export type Chantier = {
  id: string;
  nom_client: string;
  adresse: string;
  lien_dossier_onedrive: string | null;
  priorite: Priorite;
  /** Marge ± en jours (décalage vers une date cible, et slack pas pressé / normal). */
  tolerance_deplacement_jours?: number | null;
  date_creation: string;
  /** Nom de la personne connectée à la création (ou suggestion automatique). */
  created_by?: string | null;
  /** Instant de création (Europe/Paris à l’affichage). */
  created_at?: string | null;
  /** Dates approximatives, pas encore confirmées. */
  dates_estimatives?: boolean;
  date_bon_commande?: string | null;
  sous_traitant_id?: string | null;
  delai_sous_traitance_jours?: number | null;
  couleur_ral?: string | null;
  finition?: FinitionLaquage | null;
  adresse_livraison?: string | null;
  telephone_livraison?: string | null;
  plan_valide?: boolean;
  fournitures?: LigneFourniture[];
  lignes_bon_commande?: LigneBonCommande[];
  plan_demande_id?: string | null;
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
  dates_estimatives?: boolean;
  /** True seulement après le clic « Chantier lancé ». */
  lancement_valide?: boolean;
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

export type PropositionRepercussion = {
  phase_id: string;
  type_phase: TypePhase;
  nom_client: string;
  nom_salarie: string;
  old_debut: string;
  old_fin: string;
  date_debut: string;
  date_fin: string;
};

export type PlanningSolution = {
  id: string;
  title: string;
  message: string;
  patches: PhasePatch[];
  repercussions: PropositionRepercussion[];
  createChantier?: NewChantierInput;
};

export type SignalementProposition = {
  message: string;
  patches: PhasePatch[];
  repercussions: PropositionRepercussion[];
  createChantier?: NewChantierInput;
  /** Autres plans proposés (le premier est aussi dans patches / message). */
  alternatives?: PlanningSolution[];
  /** suggestion_admin : bloc Administratif 7 jours, à valider. */
  kind?: string;
  from?: string;
  to?: string;
};

export type Signalement = {
  id: string;
  employe_id: string;
  phase_id: string | null;
  retard_demi_journees: number;
  sens: SensSignalement;
  note: string;
  statut: StatutSignalement;
  date_creation: string;
  origine: OrigineSignalement;
  proposition?: SignalementProposition | null;
};

export type NewSignalementInput = {
  employe_id: string;
  phase_id?: string | null;
  retard_demi_journees: number;
  sens: SensSignalement;
  note: string;
  origine?: OrigineSignalement;
  statut?: StatutSignalement;
  proposition?: SignalementProposition | null;
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

export const CATEGORIES_DEMANDE = [
  "commande",
  "conge",
  "suggestion_site",
  "suggestion_entreprise",
  "reunion_direction",
] as const;
export type CategorieDemande = (typeof CATEGORIES_DEMANDE)[number];

export const CATEGORIE_DEMANDE_LABELS: Record<CategorieDemande, string> = {
  commande: "Commande",
  conge: "Demande de congé",
  suggestion_site: "Suggestion amélioration site",
  suggestion_entreprise: "Suggestion amélioration entreprise",
  reunion_direction: "Sujet Réunion Direction",
};

export const STATUTS_DEMANDE = [
  "en_attente",
  "traite",
  "acceptee",
  "refusee",
] as const;
export type StatutDemande = (typeof STATUTS_DEMANDE)[number];

export const STATUT_DEMANDE_LABELS: Record<StatutDemande, string> = {
  en_attente: "En attente",
  traite: "Traité",
  acceptee: "Acceptée",
  refusee: "Refusée",
};

export type Commande = {
  id: string;
  chantier_id: string;
  created_by: string | null;
  date_creation: string;
  statut: StatutCommande;
  fournisseur: string | null;
  fournitures: LigneFourniture[];
  onedrive_lien: string | null;
  nom_client: string;
};

export type CommandePatch = {
  id: string;
  statut?: StatutCommande;
  fournisseur?: string | null;
  fournitures?: LigneFourniture[];
};

export type Demande = {
  id: string;
  employe_id: string;
  categorie: CategorieDemande;
  message: string;
  date_creation: string;
  statut: StatutDemande;
  archivee: boolean;
  date_debut?: string | null;
  date_fin?: string | null;
  type_absence?: TypeAbsence | null;
  motif_precision?: string | null;
  motif_refus?: string | null;
  absence_id?: string | null;
  photos?: PieceJointe[];
};

export type NewDemandeInput = {
  categorie: CategorieDemande;
  message: string;
  employe_id?: string;
  date_debut?: string;
  date_fin?: string;
  type_absence?: TypeAbsence;
  motif_precision?: string | null;
  photos?: PieceJointe[];
};

export type DemandeUpdateInput = {
  id: string;
  statut?: StatutDemande;
  archivee?: boolean;
  motif_refus?: string | null;
  absence_id?: string | null;
};

export type PlanningSnapshot = {
  employees: Employee[];
  chantiers: Chantier[];
  elements: ElementChantier[];
  phases: PhasePlanning[];
  absences: Absence[];
  signalements: Signalement[];
  receptions: ReceptionChantier[];
  demandes: Demande[];
  commandes?: Commande[];
  horaires: HoraireSaison[];
  /** null = dates été / hiver ; ete | hiver = forcée jusqu’à nouvel ordre. */
  saison_forcee?: "ete" | "hiver" | null;
  sousTraitants?: SousTraitant[];
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
    dates_estimatives?: boolean;
  }[];
};

export type NewChantierInput = {
  nom_client: string;
  adresse: string;
  lien_dossier_onedrive: string | null;
  priorite: Priorite;
  tolerance_deplacement_jours?: number | null;
  /** Premier jour de la chaîne (1re phase planifiée). */
  date_debut?: string | null;
  /** En urgent : dernier jour de la chaîne (deadline, dernière phase). */
  date_fin?: string | null;
  dates_estimatives?: boolean;
  avec_fabrication?: boolean;
  avec_administratif?: boolean;
  avec_pose?: boolean;
  avec_thermolaquage?: boolean;
  avec_livraison?: boolean;
  adresse_livraison?: string | null;
  telephone_livraison?: string | null;
  delai_laquage_jours?: number | null;
  date_laquage_debut?: string | null;
  date_laquage_fin?: string | null;
  sous_traitant_id?: string | null;
  couleur_ral?: string | null;
  finition?: FinitionLaquage | null;
  elements: NewElementInput[];
};

export type ChantierUpdateInput = {
  id: string;
  nom_client: string;
  adresse: string;
  priorite: Priorite;
  tolerance_deplacement_jours?: number | null;
  lien_dossier_onedrive: string | null;
  dates_estimatives?: boolean;
  delai_sous_traitance_jours?: number | null;
  adresse_livraison?: string | null;
  telephone_livraison?: string | null;
  sous_traitant_id?: string | null;
};

/** Enregistrement champ par champ (sans recale). Seules les clés présentes sont écrites. */
export type ChantierSimplePatch = {
  id: string;
  nom_client?: string;
  adresse?: string;
  priorite?: Priorite;
  tolerance_deplacement_jours?: number | null;
  lien_dossier_onedrive?: string | null;
  adresse_livraison?: string | null;
  telephone_livraison?: string | null;
  fournitures?: LigneFourniture[];
  lignes_bon_commande?: LigneBonCommande[];
  couleur_ral?: string | null;
  finition?: FinitionLaquage | null;
};

export type EmployeePatch = {
  id: string;
  nom?: string;
  roles?: Role[];
  actif?: boolean;
  horaires?: HorairesEmploye | null;
  is_admin?: boolean;
  pin?: string;
};

export type AbsenceSimplePatch = {
  id: string;
  type?: TypeAbsence;
  motif_precision?: string | null;
};

export type SousTraitantPatch = {
  id: string;
  nom?: string;
  specialite?: string;
  email?: string;
  telephone?: string | null;
  adresse?: string | null;
};

export type ScheduleChantierDayInput = {
  chantierId: string;
  date: string;
  dateFin?: string;
  employeeId: string;
};

export type NewEmployeeInput = {
  nom: string;
  roles: Role[];
  actif: boolean;
  horaires?: HorairesEmploye | null;
  is_admin?: boolean;
  pin?: string;
  ordre_affichage?: number;
};

export type NewAbsenceInput = {
  employe_id: string;
  date_debut: string;
  date_fin: string;
  type: TypeAbsence;
  motif_precision?: string | null;
};

export type AbsenceUpdateInput = NewAbsenceInput & { id: string };

export type PhasePatch = {
  id: string;
  date_debut: string | null;
  date_fin: string | null;
  employe_id: string | null;
  heure_debut?: string | null;
  duree_estimee_heures?: number;
  statut?: StatutPhase;
};

export type PhaseInsert = {
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
  dates_estimatives?: boolean;
};

export type PhaseEdits = {
  patches?: PhasePatch[];
  inserts?: PhaseInsert[];
  deleteIds?: string[];
};

export const ROLE_LABELS: Record<Role, string> = {
  administratif: "Administratif",
  fabrication: "Fabrication",
  pose: "Pose",
  logistique: "Thermolaquage",
};

export const PHASE_LABELS: Record<TypePhase, string> = {
  administratif: "Administratif",
  fabrication: "Fabrication",
  logistique: "Thermolaquage",
  livraison: "Livraison",
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
export const TRANSPORT_ROW_ID = "transport-livraison";

export function isVirtualPlanningRow(rowId: string): boolean {
  return rowId === LOGISTIQUE_ROW_ID || rowId === TRANSPORT_ROW_ID;
}
