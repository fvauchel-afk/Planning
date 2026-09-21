import "server-only";
import { asAdminFlag, idsEqual } from "@/lib/auth/ids";
import {
  employeesMatchingPin,
  hashEmployeePin,
} from "@/lib/auth/pin-verify";
import { chantierHasEstimativeDates, chantierIdForPhase, phaseIdsStartedToday, withConfirmedPhases } from "@/lib/dates-estimatives";
import { parseProposition } from "@/lib/signalements";
import { phaseTypeForRoles } from "@/lib/chantier-status";
import { normalizePhasesForPlanning } from "@/lib/engine/normalize-phases";
import {
  isUnplacedDatedPhase,
  scheduleChantierSlotDays,
  schedulePhaseInserts,
} from "@/lib/engine/schedule-chantier";
import { phasesForCreate } from "@/lib/engine/create-phases";
import { compareEmployeesByOrdre, ordreAffichageFromNom } from "@/lib/display-order";
import { defaultHoraires, normalizeHoraire, normalizeHorairesEmploye, parseSaisonForcee } from "@/lib/engine/hours";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  asIsoDate,
  isMissingColumnError,
  isMissingSchemaError,
  logSupabaseError,
  wrapSupabaseError,
} from "@/lib/supabase/errors";
import type {
  Absence,
  Chantier,
  ElementChantier,
  Employee,
  HoraireSaison,
  NewAbsenceInput,
  AbsenceUpdateInput,
  AbsenceSimplePatch,
  NewChantierInput,
  ChantierUpdateInput,
  ChantierSimplePatch,
  EmployeePatch,
  ScheduleChantierDayInput,
  NewEmployeeInput,
  SousTraitantPatch,
  NewReceptionInput,
  NewDemandeInput,
  DemandeUpdateInput,
  Commande,
  CommandePatch,
  NewSignalementInput,
  PhaseEdits,
  PhaseInsert,
  PhasePatch,
  PhasePlanning,
  PlanningSnapshot,
  ReceptionChantier,
  Demande,
  Role,
  Signalement,
  StatutSignalement,
  TypePhase,
  SousTraitant,
} from "@/lib/types";
import { formatFournituresMessage, normalizeFournitures, parseFournitures } from "@/lib/fournitures";
import { parseStatutCommande } from "@/lib/commandes";
import {
  normalizeLignesBonCommande,
  parseLignesBonCommande,
} from "@/lib/bon-commande/lignes";
import { parseFinitionLaquage } from "@/lib/thermolaquage";
import { TYPES_PHASE } from "@/lib/types";
import {
  parseCategorieDemande,
  parseStatutDemande,
  parseTypeAbsence,
} from "@/lib/demandes";
import { parsePiecesJointes } from "@/lib/pieces-jointes";

type EmployeeRow = {
  id: string;
  nom: string;
  roles: Role[];
  actif: boolean;
  horaires?: Employee["horaires"];
  is_admin?: boolean;
  ordre_affichage?: number | null;
};

let inflightSnapshot: Promise<PlanningSnapshot> | null = null;
let lastSnapshot: { at: number; data: PlanningSnapshot } | null = null;
let snapshotGen = 0;
const SNAPSHOT_TTL_MS = 2500;

export function invalidateSupabaseSnapshotCache() {
  snapshotGen += 1;
  lastSnapshot = null;
  inflightSnapshot = null;
}

export async function fetchSupabaseSnapshot(): Promise<PlanningSnapshot> {
  const gen = snapshotGen;
  if (lastSnapshot && Date.now() - lastSnapshot.at < SNAPSHOT_TTL_MS) {
    return lastSnapshot.data;
  }
  if (!inflightSnapshot) {
    inflightSnapshot = fetchSupabaseSnapshotOnce()
      .then((data) => {
        if (gen === snapshotGen) {
          lastSnapshot = { at: Date.now(), data };
        }
        return data;
      })
      .finally(() => {
        if (gen === snapshotGen) {
          inflightSnapshot = null;
        }
      });
  }
  return inflightSnapshot;
}

async function fetchSupabaseSnapshotOnce(): Promise<PlanningSnapshot> {
  const supabase = createSupabaseServerClient();
  let employeeRows: EmployeeRow[] | null = null;
  const employeesFull = await supabase
    .from("employees")
    .select("id, nom, roles, actif, horaires, is_admin, ordre_affichage")
    .order("ordre_affichage")
    .order("nom");
  if (employeesFull.error && isMissingColumnError(employeesFull.error, "ordre_affichage")) {
    const withoutOrdre = await supabase
      .from("employees")
      .select("id, nom, roles, actif, horaires, is_admin")
      .order("nom");
    if (withoutOrdre.error && isMissingColumnError(withoutOrdre.error, "is_admin")) {
      const fallback = await supabase
        .from("employees")
        .select("id, nom, roles, actif, horaires")
        .order("nom");
      if (fallback.error) {
        logSupabaseError("fetchSnapshot", fallback.error);
        throw wrapSupabaseError(fallback.error);
      }
      employeeRows = (fallback.data ?? []) as EmployeeRow[];
    } else if (withoutOrdre.error) {
      logSupabaseError("fetchSnapshot", withoutOrdre.error);
      throw wrapSupabaseError(withoutOrdre.error);
    } else {
      employeeRows = (withoutOrdre.data ?? []) as EmployeeRow[];
    }
  } else if (employeesFull.error && isMissingColumnError(employeesFull.error, "is_admin")) {
    const fallback = await supabase
      .from("employees")
      .select("id, nom, roles, actif, horaires")
      .order("nom");
    if (fallback.error) {
      logSupabaseError("fetchSnapshot", fallback.error);
      throw wrapSupabaseError(fallback.error);
    }
    employeeRows = (fallback.data ?? []) as EmployeeRow[];
  } else if (employeesFull.error) {
    logSupabaseError("fetchSnapshot", employeesFull.error);
    throw wrapSupabaseError(employeesFull.error);
  } else {
    employeeRows = (employeesFull.data ?? []) as EmployeeRow[];
  }
  const [chantiers, elements, phases, absences, horaires] = await Promise.all([
    supabase.from("chantiers").select("*").order("date_creation"),
    supabase.from("elements_chantier").select("*"),
    supabase.from("phases_planning").select("*"),
    supabase.from("absences").select("*"),
    supabase.from("horaires_saisonniers").select("*").order("ordre"),
  ]);

  const firstError =
    chantiers.error ||
    elements.error ||
    phases.error ||
    absences.error;
  if (firstError) {
    logSupabaseError("fetchSnapshot", firstError);
    throw wrapSupabaseError(firstError);
  }

  const extra = await Promise.all([
    supabase.from("signalements").select("*").order("date_creation", {
      ascending: false,
    }),
    supabase.from("receptions_chantier").select("*").order("date_signature", {
      ascending: false,
    }),
    supabase.from("demandes").select("*").order("date_creation", {
      ascending: false,
    }),
    supabase.from("commandes").select("*").order("date_creation", {
      ascending: false,
    }),
    supabase.from("sous_traitants").select("*").order("nom"),
    supabase.from("planning_reglages").select("saison_forcee").eq("id", "default").maybeSingle(),
  ]);
  const [signalements, receptions, demandes, commandes, sousTraitants, reglages] = extra;

  const signalementRows = isMissingSchemaError(signalements.error)
    ? []
    : signalements.error
      ? (() => {
          throw wrapSupabaseError(signalements.error);
        })()
      : ((signalements.data ?? []) as Signalement[]);

  const snapshot: PlanningSnapshot = {
    employees: (employeeRows ?? [])
      .map((row: EmployeeRow) => ({
        id: row.id,
        nom: row.nom,
        roles: row.roles ?? [],
        actif: row.actif,
        horaires: normalizeHorairesEmploye(row.horaires),
        is_admin: asAdminFlag(row.is_admin),
        ordre_affichage:
          typeof row.ordre_affichage === "number"
            ? row.ordre_affichage
            : ordreAffichageFromNom(row.nom),
      }))
      .sort(compareEmployeesByOrdre),
    chantiers: ((chantiers.data ?? []) as Chantier[]).map((chantier) => ({
      ...chantier,
      date_creation: asIsoDate(chantier.date_creation) ?? chantier.date_creation,
      created_by:
        typeof (chantier as Chantier).created_by === "string"
          ? (chantier as Chantier).created_by?.trim() || null
          : null,
      created_at:
        typeof (chantier as Chantier).created_at === "string" &&
        (chantier as Chantier).created_at?.trim()
          ? (chantier as Chantier).created_at
          : null,
      dates_estimatives: Boolean(chantier.dates_estimatives),
      date_bon_commande: asIsoDate(chantier.date_bon_commande) ?? chantier.date_bon_commande ?? null,
      sous_traitant_id: chantier.sous_traitant_id ?? null,
      delai_sous_traitance_jours:
        typeof chantier.delai_sous_traitance_jours === "number"
          ? chantier.delai_sous_traitance_jours
          : 5,
      tolerance_deplacement_jours:
        typeof chantier.tolerance_deplacement_jours === "number"
          ? chantier.tolerance_deplacement_jours
          : null,
      plan_valide: Boolean(
        (chantier as Chantier & { plan_valide?: boolean }).plan_valide,
      ),
      fournitures: parseFournitures(
        (chantier as Chantier & { fournitures?: unknown }).fournitures,
      ),
      lignes_bon_commande: parseLignesBonCommande(
        (chantier as Chantier & { lignes_bon_commande?: unknown })
          .lignes_bon_commande,
      ),
      plan_demande_id:
        typeof (chantier as Chantier & { plan_demande_id?: unknown })
          .plan_demande_id === "string"
          ? (chantier as Chantier).plan_demande_id ?? null
          : null,
      couleur_ral:
        typeof (chantier as Chantier & { couleur_ral?: unknown }).couleur_ral ===
        "string"
          ? (chantier as Chantier).couleur_ral?.trim() || null
          : null,
      finition: parseFinitionLaquage(
        (chantier as Chantier & { finition?: unknown }).finition,
      ),
    })),
    elements: (elements.data ?? []) as ElementChantier[],
    phases: normalizePhasesForPlanning(
      ((phases.data ?? []) as PhasePlanning[]).map((phase) => ({
        ...phase,
        duree_estimee_heures: Number(phase.duree_estimee_heures),
        heures_supplementaires_par_jour: Number(
          phase.heures_supplementaires_par_jour ?? 0,
        ),
        date_debut: asIsoDate(phase.date_debut),
        date_fin: asIsoDate(phase.date_fin),
        heure_debut:
          typeof phase.heure_debut === "string" && phase.heure_debut.trim()
            ? phase.heure_debut.trim().slice(0, 5)
            : null,
        dates_estimatives: Boolean(phase.dates_estimatives),
      lancement_valide: Boolean(phase.lancement_valide),
      })),
    ),
    absences: ((absences.data ?? []) as Absence[]).map((absence) => ({
      ...absence,
      date_debut: asIsoDate(absence.date_debut) ?? absence.date_debut,
      date_fin: asIsoDate(absence.date_fin) ?? absence.date_fin,
      motif_precision: absence.motif_precision ?? null,
    })),
    signalements: signalementRows.map((row) => {
      const item = row as Signalement;
      return {
        ...item,
        phase_id: item.phase_id || null,
        retard_demi_journees: Number(item.retard_demi_journees),
        date_creation: item.date_creation,
        sens: item.sens === "avance" ? "avance" : "retard",
        origine: item.origine === "decalage_admin" ? "decalage_admin" : "salarie",
        proposition: parseProposition(
          (row as { proposition?: unknown }).proposition,
        ),
      };
    }),
    receptions: optionalTable<ReceptionChantier>(receptions).map((row) => ({
      ...row,
      onedrive_erreur: row.onedrive_erreur ?? null,
    })),
    demandes: optionalTable<Demande>(demandes)
      .map((row) => {
        const raw = row as Demande & Record<string, unknown>;
        return {
          id: row.id,
          employe_id: row.employe_id,
          categorie: parseCategorieDemande(row.categorie),
          message: row.message ?? "",
          date_creation: row.date_creation,
          statut: parseStatutDemande(row.statut),
          archivee: Boolean(row.archivee),
          date_debut: asIsoDate(raw.date_debut) ?? null,
          date_fin: asIsoDate(raw.date_fin) ?? null,
          type_absence: parseTypeAbsence(raw.type_absence),
          motif_precision:
            typeof raw.motif_precision === "string" ? raw.motif_precision : null,
          motif_refus:
            typeof raw.motif_refus === "string" ? raw.motif_refus : null,
          absence_id:
            typeof raw.absence_id === "string" ? raw.absence_id : null,
          photos: parsePiecesJointes(raw.photos),
        };
      })
      .sort(
        (left, right) =>
          Date.parse(right.date_creation) - Date.parse(left.date_creation),
      ),
    commandes: optionalTable<Record<string, unknown>>(commandes).map(mapCommandeRow),
    sousTraitants: optionalTable<SousTraitant>(sousTraitants).map((row) => ({
      id: row.id,
      nom: row.nom,
      specialite: row.specialite,
      email: row.email,
      telephone: row.telephone ?? null,
      adresse: row.adresse ?? null,
    })),
    horaires: (() => {
      const rows = optionalTable<HoraireSaison>(horaires).map((row) =>
        normalizeHoraire({
          ...row,
          ordre: Number(row.ordre),
        }),
      );
      return rows.length > 0 ? rows : defaultHoraires();
    })(),
    saison_forcee: (() => {
      if (isMissingSchemaError(reglages.error)) return null;
      if (reglages.error) {
        logSupabaseError("planning_reglages", reglages.error);
        return null;
      }
      const row = reglages.data as { saison_forcee?: unknown } | null;
      return parseSaisonForcee(row?.saison_forcee);
    })(),
  };
  const started = phaseIdsStartedToday(snapshot);
  if (started.length) {
    try {
      await supabaseConfirmPhaseDates(snapshot, started);
      return withConfirmedPhases(snapshot, started);
    } catch (err) {
      logSupabaseError("confirmPhaseDates today", err);
      return snapshot;
    }
  }
  return snapshot;
}

function optionalTable<T>(result: {
  data: T[] | null;
  error: { message?: string; code?: string } | null;
}): T[] {
  if (!result.error) return result.data ?? [];
  if (isMissingSchemaError(result.error)) return [];
  throw wrapSupabaseError(result.error);
}

function mapCommandeRow(row: Record<string, unknown>): Commande {
  return {
    id: String(row.id ?? ""),
    chantier_id: String(row.chantier_id ?? ""),
    created_by: row.created_by ? String(row.created_by) : null,
    date_creation: String(row.date_creation ?? ""),
    statut: parseStatutCommande(row.statut),
    fournisseur: row.fournisseur ? String(row.fournisseur) : null,
    fournitures: parseFournitures(row.fournitures),
    onedrive_lien: row.onedrive_lien ? String(row.onedrive_lien) : null,
    nom_client: String(row.nom_client ?? ""),
  };
}

export async function supabaseCreateChantier(
  input: NewChantierInput,
  createdBy?: string | null,
): Promise<string> {
  const supabase = createSupabaseServerClient();
  const origine = {
    created_by: createdBy?.trim() || null,
    created_at: new Date().toISOString(),
  };
  const payload = {
    nom_client: input.nom_client,
    adresse: input.adresse,
    lien_dossier_onedrive: input.lien_dossier_onedrive,
    priorite: input.priorite,
    dates_estimatives: Boolean(input.dates_estimatives),
    delai_sous_traitance_jours: Math.min(
      60,
      Math.max(1, Number(input.delai_laquage_jours) || 5),
    ),
    tolerance_deplacement_jours:
      input.priorite === "prioritaire"
        ? null
        : input.tolerance_deplacement_jours == null ||
            input.tolerance_deplacement_jours === undefined
          ? input.priorite === "pas_presse"
            ? 30
            : null
          : Math.min(
              180,
              Math.max(1, Number(input.tolerance_deplacement_jours) || 1),
            ),
    adresse_livraison: input.avec_livraison ? input.adresse_livraison ?? null : null,
    telephone_livraison: input.avec_livraison
      ? input.telephone_livraison ?? null
      : null,
    sous_traitant_id: input.avec_thermolaquage
      ? input.sous_traitant_id || null
      : null,
    couleur_ral: input.avec_thermolaquage
      ? input.couleur_ral?.trim() || null
      : null,
    finition: input.avec_thermolaquage
      ? parseFinitionLaquage(input.finition)
      : null,
    ...origine,
  };
  let inserted = await supabase
    .from("chantiers")
    .insert(payload)
    .select("id")
    .single();
  if (
    inserted.error &&
    (isMissingColumnError(inserted.error, "created_by") ||
      isMissingColumnError(inserted.error, "created_at"))
  ) {
    const withoutOrigine = { ...payload } as Record<string, unknown>;
    delete withoutOrigine.created_by;
    delete withoutOrigine.created_at;
    inserted = await supabase
      .from("chantiers")
      .insert(withoutOrigine)
      .select("id")
      .single();
  }
  if (
    inserted.error &&
    (isMissingColumnError(inserted.error, "couleur_ral") ||
      isMissingColumnError(inserted.error, "finition"))
  ) {
    const withoutColor = { ...payload } as Record<string, unknown>;
    delete withoutColor.couleur_ral;
    delete withoutColor.finition;
    inserted = await supabase
      .from("chantiers")
      .insert(withoutColor)
      .select("id")
      .single();
  }
  if (inserted.error && isMissingColumnError(inserted.error, "sous_traitant_id")) {
    const withoutSt = { ...payload, sous_traitant_id: undefined };
    delete withoutSt.sous_traitant_id;
    inserted = await supabase.from("chantiers").insert(withoutSt).select("id").single();
  }
  if (inserted.error && isMissingColumnError(inserted.error, "tolerance_deplacement_jours")) {
    inserted = await supabase
      .from("chantiers")
      .insert({
        nom_client: payload.nom_client,
        adresse: payload.adresse,
        lien_dossier_onedrive: payload.lien_dossier_onedrive,
        priorite: payload.priorite,
        dates_estimatives: payload.dates_estimatives,
        delai_sous_traitance_jours: payload.delai_sous_traitance_jours,
        adresse_livraison: payload.adresse_livraison,
        telephone_livraison: payload.telephone_livraison,
        ...origine,
      })
      .select("id")
      .single();
  }
  if (inserted.error && isMissingColumnError(inserted.error, "adresse_livraison")) {
    inserted = await supabase
      .from("chantiers")
      .insert({
        nom_client: payload.nom_client,
        adresse: payload.adresse,
        lien_dossier_onedrive: payload.lien_dossier_onedrive,
        priorite: payload.priorite,
        dates_estimatives: payload.dates_estimatives,
        delai_sous_traitance_jours: payload.delai_sous_traitance_jours,
        ...origine,
      })
      .select("id")
      .single();
  }
  if (inserted.error && isMissingColumnError(inserted.error, "delai_sous_traitance_jours")) {
    inserted = await supabase
      .from("chantiers")
      .insert({
        nom_client: payload.nom_client,
        adresse: payload.adresse,
        lien_dossier_onedrive: payload.lien_dossier_onedrive,
        priorite: payload.priorite,
        dates_estimatives: payload.dates_estimatives,
        ...origine,
      })
      .select("id")
      .single();
  }
  if (inserted.error && isMissingColumnError(inserted.error, "dates_estimatives")) {
    inserted = await supabase
      .from("chantiers")
      .insert({
        nom_client: payload.nom_client,
        adresse: payload.adresse,
        lien_dossier_onedrive: payload.lien_dossier_onedrive,
        priorite: payload.priorite,
        ...origine,
      })
      .select("id")
      .single();
  }
  if (inserted.error || !inserted.data) {
    throw wrapSupabaseError(
      inserted.error ?? new Error("Création du chantier impossible."),
    );
  }
  const chantier = inserted.data;

  for (const element of input.elements) {
    const { data: elementRow, error: elementError } = await supabase
      .from("elements_chantier")
      .insert({
        chantier_id: chantier.id,
        nom_element: element.nom_element,
      })
      .select("id")
      .single();
    if (elementError || !elementRow) {
      throw wrapSupabaseError(
        elementError ?? new Error("Création de l'élément impossible."),
      );
    }

    const phases =
      element.phases.length > 0
        ? element.phases
        : TYPES_PHASE.map((type_phase: TypePhase) => ({
            type_phase,
            duree_estimee_heures: 0,
            date_debut: null,
            date_fin: null,
            heure_debut: null,
            employe_id: null,
            urgent: false,
            heures_supplementaires_par_jour: 0,
            dates_estimatives: Boolean(input.dates_estimatives),
          }));

    const rows = phasesForCreate(phases).map((phase) => ({
      element_id: elementRow.id,
      type_phase: phase.type_phase,
      duree_estimee_heures: phase.duree_estimee_heures,
      date_debut: phase.date_debut,
      date_fin: phase.date_fin,
      heure_debut: phase.heure_debut ?? null,
      employe_id: phase.employe_id,
      statut: "a_faire",
      urgent: phase.urgent,
      heures_supplementaires_par_jour:
        phase.heures_supplementaires_par_jour ?? 0,
      dates_estimatives: Boolean(
        phase.dates_estimatives ?? input.dates_estimatives,
      ),
    }));
    const { error: phaseError } = await supabase.from("phases_planning").insert(rows);
    if (phaseError) {
      if (isMissingColumnError(phaseError, "dates_estimatives")) {
        const { error: retry } = await supabase.from("phases_planning").insert(
          rows.map((row) => {
            const payload = { ...row };
            delete (payload as { dates_estimatives?: boolean }).dates_estimatives;
            return payload;
          }),
        );
        if (retry) throw wrapSupabaseError(retry);
      } else if (isMissingColumnError(phaseError, "heure_debut")) {
        const { error: retry } = await supabase.from("phases_planning").insert(
          rows.map((row) => {
            const payload = { ...row };
            delete (payload as { heure_debut?: string | null }).heure_debut;
            return payload;
          }),
        );
        if (retry) throw wrapSupabaseError(retry);
      } else {
        throw wrapSupabaseError(phaseError);
      }
    }
  }
  return chantier.id;
}

export async function supabaseUpdateChantier(
  input: ChantierUpdateInput,
): Promise<void> {
  const supabase = createSupabaseServerClient();
  const payload: Record<string, unknown> = {
    nom_client: input.nom_client,
    adresse: input.adresse,
    priorite: input.priorite,
    lien_dossier_onedrive: input.lien_dossier_onedrive,
    dates_estimatives: Boolean(input.dates_estimatives),
  };
  if (input.delai_sous_traitance_jours !== undefined) {
    payload.delai_sous_traitance_jours = input.delai_sous_traitance_jours;
  }
  if (input.adresse_livraison !== undefined) {
    payload.adresse_livraison = input.adresse_livraison;
  }
  if (input.telephone_livraison !== undefined) {
    payload.telephone_livraison = input.telephone_livraison;
  }
  if (input.sous_traitant_id !== undefined) {
    payload.sous_traitant_id = input.sous_traitant_id;
  }
  if (input.tolerance_deplacement_jours !== undefined) {
    payload.tolerance_deplacement_jours =
      input.priorite === "prioritaire"
        ? null
        : Math.min(180, Math.max(1, Number(input.tolerance_deplacement_jours) || 1));
  }
  let { error } = await supabase
    .from("chantiers")
    .update(payload)
    .eq("id", input.id);
  if (error && isMissingColumnError(error, "sous_traitant_id")) {
    const withoutSt = { ...payload };
    delete withoutSt.sous_traitant_id;
    const retrySt = await supabase
      .from("chantiers")
      .update(withoutSt)
      .eq("id", input.id);
    error = retrySt.error;
  }
  if (error && isMissingColumnError(error, "tolerance_deplacement_jours")) {
    const withoutTol = { ...payload };
    delete withoutTol.tolerance_deplacement_jours;
    const retryTol = await supabase
      .from("chantiers")
      .update(withoutTol)
      .eq("id", input.id);
    error = retryTol.error;
  }
  if (error && isMissingColumnError(error, "adresse_livraison")) {
    const withoutLiv = { ...payload };
    delete withoutLiv.adresse_livraison;
    delete withoutLiv.telephone_livraison;
    const retryLiv = await supabase
      .from("chantiers")
      .update(withoutLiv)
      .eq("id", input.id);
    if (retryLiv.error && isMissingColumnError(retryLiv.error, "delai_sous_traitance_jours")) {
      error = retryLiv.error;
    } else if (retryLiv.error) {
      throw wrapSupabaseError(retryLiv.error);
    } else {
      return;
    }
  }
  if (error && isMissingColumnError(error, "delai_sous_traitance_jours")) {
    const withoutDelay = { ...payload };
    delete withoutDelay.delai_sous_traitance_jours;
    const retry = await supabase
      .from("chantiers")
      .update(withoutDelay)
      .eq("id", input.id);
    if (retry.error && isMissingColumnError(retry.error, "dates_estimatives")) {
      const fallback = await supabase
        .from("chantiers")
        .update({
          nom_client: input.nom_client,
          adresse: input.adresse,
          priorite: input.priorite,
          lien_dossier_onedrive: input.lien_dossier_onedrive,
        })
        .eq("id", input.id);
      if (fallback.error) throw wrapSupabaseError(fallback.error);
      return;
    }
    if (retry.error) throw wrapSupabaseError(retry.error);
    return;
  }
  if (error && isMissingColumnError(error, "dates_estimatives")) {
    const retry = await supabase
      .from("chantiers")
      .update({
        nom_client: input.nom_client,
        adresse: input.adresse,
        priorite: input.priorite,
        lien_dossier_onedrive: input.lien_dossier_onedrive,
      })
      .eq("id", input.id);
    if (retry.error) throw wrapSupabaseError(retry.error);
    return;
  }
  if (error) throw wrapSupabaseError(error);
}

const CHANTIER_OPTIONAL_COLUMNS = [
  "tolerance_deplacement_jours",
  "sous_traitant_id",
  "adresse_livraison",
  "telephone_livraison",
  "delai_sous_traitance_jours",
  "dates_estimatives",
  "plan_valide",
  "fournitures",
  "lignes_bon_commande",
  "plan_demande_id",
  "couleur_ral",
  "finition",
] as const;

async function updateChantierPayload(
  id: string,
  payload: Record<string, unknown>,
): Promise<void> {
  const supabase = createSupabaseServerClient();
  const current = { ...payload };
  for (let attempt = 0; attempt < 12; attempt += 1) {
    if (Object.keys(current).length === 0) return;
    const { error } = await supabase.from("chantiers").update(current).eq("id", id);
    if (!error) return;
    const drop = CHANTIER_OPTIONAL_COLUMNS.find(
      (column) => column in current && isMissingColumnError(error, column),
    );
    if (drop) {
      delete current[drop];
      continue;
    }
    throw wrapSupabaseError(error);
  }
}

export async function supabasePatchChantier(
  input: ChantierSimplePatch,
): Promise<void> {
  const payload: Record<string, unknown> = {};
  if (input.nom_client !== undefined) payload.nom_client = input.nom_client;
  if (input.adresse !== undefined) payload.adresse = input.adresse;
  if (input.priorite !== undefined) payload.priorite = input.priorite;
  if (input.lien_dossier_onedrive !== undefined) {
    payload.lien_dossier_onedrive = input.lien_dossier_onedrive;
  }
  if (input.adresse_livraison !== undefined) {
    payload.adresse_livraison = input.adresse_livraison;
  }
  if (input.telephone_livraison !== undefined) {
    payload.telephone_livraison = input.telephone_livraison;
  }
  if (input.tolerance_deplacement_jours !== undefined) {
    payload.tolerance_deplacement_jours =
      input.priorite === "prioritaire"
        ? null
        : input.tolerance_deplacement_jours;
  }
  if (input.fournitures !== undefined) {
    payload.fournitures = normalizeFournitures(input.fournitures);
  }
  if (input.lignes_bon_commande !== undefined) {
    payload.lignes_bon_commande = normalizeLignesBonCommande(
      input.lignes_bon_commande,
    );
  }
  if (input.couleur_ral !== undefined) {
    payload.couleur_ral = input.couleur_ral?.trim() || null;
  }
  if (input.finition !== undefined) {
    payload.finition = parseFinitionLaquage(input.finition);
  }
  if (Object.keys(payload).length === 0) return;
  await updateChantierPayload(input.id, payload);
}

export async function supabaseValidateChantierPlan(input: {
  chantierId: string;
  employeId: string;
}): Promise<{ created: boolean; message: string; nomClient: string }> {
  const snapshot = await fetchSupabaseSnapshot();
  const chantier = snapshot.chantiers.find((row) => row.id === input.chantierId);
  if (!chantier) throw new Error("Chantier introuvable.");
  const nomClient = chantier.nom_client;
  if (chantier.plan_valide) {
    return { created: false, message: "", nomClient };
  }
  const message = formatFournituresMessage(
    chantier.nom_client,
    normalizeFournitures(chantier.fournitures ?? []),
    chantier.lien_dossier_onedrive,
  );
  const supabase = createSupabaseServerClient();
  const { error } = await supabase.from("commandes").insert({
    chantier_id: input.chantierId,
    created_by: input.employeId,
    statut: "a_faire",
    fournisseur: null,
    fournitures: normalizeFournitures(chantier.fournitures ?? []),
    onedrive_lien: chantier.lien_dossier_onedrive,
    nom_client: chantier.nom_client,
  });
  if (error) throw wrapSupabaseError(error);
  invalidateSupabaseSnapshotCache();
  await updateChantierPayload(input.chantierId, {
    plan_valide: true,
  });
  return { created: true, message, nomClient };
}

export async function supabasePatchCommande(input: CommandePatch): Promise<void> {
  const supabase = createSupabaseServerClient();
  const payload: Record<string, unknown> = {};
  if (input.statut !== undefined) payload.statut = parseStatutCommande(input.statut);
  if (input.fournisseur !== undefined) {
    payload.fournisseur = input.fournisseur?.trim() || null;
  }
  if (input.fournitures !== undefined) {
    payload.fournitures = normalizeFournitures(input.fournitures);
  }
  if (Object.keys(payload).length === 0) return;
  const { error } = await supabase.from("commandes").update(payload).eq("id", input.id);
  if (error) throw wrapSupabaseError(error);
}

export async function supabaseDeleteChantier(chantierId: string): Promise<void> {
  const supabase = createSupabaseServerClient();
  const { error } = await supabase.from("chantiers").delete().eq("id", chantierId);
  if (error) throw wrapSupabaseError(error);
}

export async function supabaseScheduleChantierDay(
  input: ScheduleChantierDayInput,
): Promise<void> {
  const supabase = createSupabaseServerClient();
  const { data: employee, error: employeeError } = await supabase
    .from("employees")
    .select("id, roles, actif")
    .eq("id", input.employeeId)
    .maybeSingle();
  if (employeeError) throw wrapSupabaseError(employeeError);
  if (!employee || employee.actif === false) {
    throw wrapSupabaseError(new Error("Salarié introuvable ou inactif."));
  }
  const typePhase = phaseTypeForRoles((employee.roles ?? []) as Role[]);
  const days = scheduleChantierSlotDays(input.date, input.dateFin || input.date);
  if (days.length === 0) {
    throw wrapSupabaseError(
      new Error("Aucune journée ouvrée dans la plage choisie."),
    );
  }

  let elementId: string | null = null;
  const existing = await supabase
    .from("elements_chantier")
    .select("id")
    .eq("chantier_id", input.chantierId)
    .order("nom_element")
    .limit(1);
  if (existing.error) throw wrapSupabaseError(existing.error);
  const existingId = existing.data?.[0]?.id;
  if (existingId) {
    elementId = String(existingId);
  } else {
    const created = await supabase
      .from("elements_chantier")
      .insert({ chantier_id: input.chantierId, nom_element: "Travaux" })
      .select("id")
      .single();
    if (created.error || !created.data?.id) {
      throw wrapSupabaseError(
        created.error ?? new Error("Création de l’élément impossible."),
      );
    }
    elementId = String(created.data.id);
  }

  const elementRows = await supabase
    .from("elements_chantier")
    .select("id")
    .eq("chantier_id", input.chantierId);
  if (elementRows.error) throw wrapSupabaseError(elementRows.error);
  const elementIds = (elementRows.data ?? []).map((row) => String(row.id));
  if (elementIds.length > 0) {
    const existingPhases = await supabase
      .from("phases_planning")
      .select("id, duree_estimee_heures, date_debut, employe_id, type_phase, element_id")
      .in("element_id", elementIds);
    if (existingPhases.error) throw wrapSupabaseError(existingPhases.error);
    const ghostIds = (existingPhases.data ?? [])
      .filter((phase) =>
        isUnplacedDatedPhase({
          date_debut: phase.date_debut as string | null,
          duree_estimee_heures: Number(phase.duree_estimee_heures ?? 0),
          employe_id: (phase.employe_id as string | null) ?? null,
          type_phase: String(phase.type_phase),
        }),
      )
      .map((phase) => String(phase.id));
    if (ghostIds.length > 0) {
      const removed = await supabase.from("phases_planning").delete().in("id", ghostIds);
      if (removed.error) throw wrapSupabaseError(removed.error);
    }
  }

  const rows = schedulePhaseInserts(elementId, typePhase, input.employeeId, days);
  const { error: phaseError } = await supabase.from("phases_planning").insert(rows);
  if (phaseError) {
    if (isMissingColumnError(phaseError, "heure_debut")) {
      const { error: retry } = await supabase.from("phases_planning").insert(
        rows.map((row) => {
          const payload = { ...row };
          delete (payload as { heure_debut?: string }).heure_debut;
          return payload;
        }),
      );
      if (retry) throw wrapSupabaseError(retry);
      return;
    }
    throw wrapSupabaseError(phaseError);
  }
}

async function assertPinAvailable(
  supabase: ReturnType<typeof createSupabaseServerClient>,
  pin: string,
  exceptEmployeeId?: string,
) {
  const { data, error } = await supabase
    .from("employees")
    .select("id, nom, is_admin, actif, pin_hash")
    .not("pin_hash", "is", null);
  if (error) {
    if (isMissingColumnError(error, "pin_hash")) return;
    throw wrapSupabaseError(error);
  }
  const matches = await employeesMatchingPin(pin, data ?? []);
  if (matches.some((row) => !idsEqual(String(row.id), exceptEmployeeId))) {
    throw wrapSupabaseError(
      new Error("Ce code PIN est déjà utilisé par un autre employé."),
    );
  }
}

async function writeEmployeePinHash(
  supabase: ReturnType<typeof createSupabaseServerClient>,
  employeeId: string,
  pin: string,
) {
  const hash = await hashEmployeePin(pin);
  const { error } = await supabase
    .from("employees")
    .update({ pin_hash: hash })
    .eq("id", employeeId);
  if (!error) return;
  if (isMissingColumnError(error, "pin_hash")) {
    const { error: pinError } = await supabase.rpc("set_employee_pin", {
      p_id: employeeId,
      p_pin: pin,
    });
    if (pinError) throw wrapSupabaseError(pinError);
    return;
  }
  throw wrapSupabaseError(error);
}

export async function supabaseUpsertEmployee(
  input: NewEmployeeInput & { id?: string },
): Promise<void> {
  const supabase = createSupabaseServerClient();
  const pin = input.pin?.trim();
  if (pin) {
    await assertPinAvailable(supabase, pin, input.id);
  }
  const defaultPinHash = !input.id
    ? await hashEmployeePin(pin && /^\d{4}$/.test(pin) ? pin : "1234")
    : null;
  const payload: Record<string, unknown> = {
    nom: input.nom,
    roles: input.roles,
    actif: input.actif,
    horaires: normalizeHorairesEmploye(input.horaires),
    is_admin: Boolean(input.is_admin),
  };
  if (defaultPinHash) payload.pin_hash = defaultPinHash;
  if (input.ordre_affichage != null) {
    payload.ordre_affichage = input.ordre_affichage;
  } else if (!input.id) {
    payload.ordre_affichage = ordreAffichageFromNom(input.nom);
  }
  let employeeId = input.id;
  if (input.id) {
    const { error } = await supabase
      .from("employees")
      .update(payload)
      .eq("id", input.id);
    if (error) {
      if (
        isMissingColumnError(error, "is_admin") ||
        isMissingColumnError(error, "horaires") ||
        isMissingColumnError(error, "ordre_affichage") ||
        isMissingColumnError(error, "pin_hash")
      ) {
        const { error: retry } = await supabase
          .from("employees")
          .update({
            nom: payload.nom,
            roles: payload.roles,
            actif: payload.actif,
            ...(isMissingColumnError(error, "horaires")
              ? {}
              : { horaires: payload.horaires }),
            ...(isMissingColumnError(error, "is_admin")
              ? {}
              : { is_admin: payload.is_admin }),
            ...(isMissingColumnError(error, "ordre_affichage")
              ? {}
              : payload.ordre_affichage != null
                ? { ordre_affichage: payload.ordre_affichage }
                : {}),
          })
          .eq("id", input.id);
        if (retry) throw wrapSupabaseError(retry);
      } else {
        throw wrapSupabaseError(error);
      }
    }
  } else {
    const { data, error } = await supabase
      .from("employees")
      .insert(payload)
      .select("id")
      .single();
    if (error) {
      if (
        isMissingColumnError(error, "is_admin") ||
        isMissingColumnError(error, "horaires") ||
        isMissingColumnError(error, "ordre_affichage") ||
        isMissingColumnError(error, "pin_hash")
      ) {
        const slim = {
          nom: payload.nom,
          roles: payload.roles,
          actif: payload.actif,
          ...(isMissingColumnError(error, "horaires")
            ? {}
            : { horaires: payload.horaires }),
          ...(isMissingColumnError(error, "is_admin")
            ? {}
            : { is_admin: payload.is_admin }),
          ...(isMissingColumnError(error, "ordre_affichage")
            ? {}
            : payload.ordre_affichage != null
              ? { ordre_affichage: payload.ordre_affichage }
              : {}),
          ...(isMissingColumnError(error, "pin_hash")
            ? {}
            : payload.pin_hash
              ? { pin_hash: payload.pin_hash }
              : {}),
        };
        const retry = await supabase.from("employees").insert(slim).select("id").single();
        if (retry.error) throw wrapSupabaseError(retry.error);
        employeeId = retry.data?.id;
      } else {
        throw wrapSupabaseError(error);
      }
    } else {
      employeeId = data?.id;
    }
  }
  if (pin && employeeId) {
    await writeEmployeePinHash(supabase, employeeId, pin);
  }
}

export async function supabasePatchEmployee(input: EmployeePatch): Promise<void> {
  const supabase = createSupabaseServerClient();
  const payload: Record<string, unknown> = {};
  if (input.nom !== undefined) payload.nom = input.nom;
  if (input.roles !== undefined) payload.roles = input.roles;
  if (input.actif !== undefined) payload.actif = input.actif;
  if (input.horaires !== undefined) {
    payload.horaires = normalizeHorairesEmploye(input.horaires);
  }
  if (input.is_admin !== undefined) payload.is_admin = Boolean(input.is_admin);
  if (Object.keys(payload).length > 0) {
    const current = { ...payload };
    for (let attempt = 0; attempt < 6; attempt += 1) {
      if (Object.keys(current).length === 0) break;
      const { error } = await supabase
        .from("employees")
        .update(current)
        .eq("id", input.id);
      if (!error) break;
      const drop = (["horaires", "is_admin", "ordre_affichage"] as const).find(
        (column) => column in current && isMissingColumnError(error, column),
      );
      if (drop) {
        delete current[drop];
        continue;
      }
      throw wrapSupabaseError(error);
    }
  }
  const pin = input.pin?.trim();
  if (pin) {
    await assertPinAvailable(supabase, pin, input.id);
    await writeEmployeePinHash(supabase, input.id, pin);
  }
}

export async function supabaseReorderEmployees(
  rows: { id: string; ordre_affichage: number }[],
): Promise<void> {
  const supabase = createSupabaseServerClient();
  for (const row of rows) {
    const { error } = await supabase
      .from("employees")
      .update({ ordre_affichage: row.ordre_affichage })
      .eq("id", row.id);
    if (error) {
      if (isMissingColumnError(error, "ordre_affichage")) {
        throw new Error(
          "La colonne ordre_affichage est absente. Appliquez les migrations Supabase.",
        );
      }
      throw wrapSupabaseError(error);
    }
  }
}

export async function supabaseCreateAbsence(
  input: NewAbsenceInput,
): Promise<Absence> {
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .from("absences")
    .insert({
      employe_id: input.employe_id,
      date_debut: input.date_debut,
      date_fin: input.date_fin,
      type: input.type,
      motif_precision:
        input.type === "autre" ? input.motif_precision?.trim() || null : null,
    })
    .select("*")
    .single();
  if (error) throw wrapSupabaseError(error);
  return {
    ...(data as Absence),
    date_debut: asIsoDate((data as Absence).date_debut) ?? input.date_debut,
    date_fin: asIsoDate((data as Absence).date_fin) ?? input.date_fin,
    motif_precision: (data as Absence).motif_precision ?? null,
  };
}

export async function supabaseDeleteAbsence(id: string): Promise<void> {
  const supabase = createSupabaseServerClient();
  const { error } = await supabase.from("absences").delete().eq("id", id);
  if (error) throw wrapSupabaseError(error);
}

export async function supabaseUpdateAbsence(
  input: AbsenceUpdateInput,
): Promise<void> {
  const supabase = createSupabaseServerClient();
  const { error } = await supabase
    .from("absences")
    .update({
      employe_id: input.employe_id,
      date_debut: input.date_debut,
      date_fin: input.date_fin,
      type: input.type,
      motif_precision:
        input.type === "autre" ? input.motif_precision?.trim() || null : null,
    })
    .eq("id", input.id);
  if (error) throw wrapSupabaseError(error);
}

export async function supabasePatchAbsence(
  input: AbsenceSimplePatch,
): Promise<void> {
  const supabase = createSupabaseServerClient();
  const payload: Record<string, unknown> = {};
  if (input.type !== undefined) payload.type = input.type;
  if (input.motif_precision !== undefined) {
    payload.motif_precision =
      input.type === "autre" || input.type === undefined
        ? input.motif_precision?.trim() || null
        : null;
  } else if (input.type !== undefined && input.type !== "autre") {
    payload.motif_precision = null;
  }
  if (Object.keys(payload).length === 0) return;
  const { error } = await supabase.from("absences").update(payload).eq("id", input.id);
  if (error) throw wrapSupabaseError(error);
}

export async function supabaseApplyPhaseEdits(edits: PhaseEdits): Promise<void> {
  if (edits.patches?.length) {
    await supabaseApplyPhasePatches(edits.patches);
  }
  const supabase = createSupabaseServerClient();
  if (edits.deleteIds?.length) {
    const { error } = await supabase
      .from("phases_planning")
      .delete()
      .in("id", edits.deleteIds);
    if (error) throw wrapSupabaseError(error);
  }
  if (edits.inserts?.length) {
    await supabaseInsertPhases(edits.inserts);
  }
}

async function supabaseInsertPhases(rows: PhaseInsert[]): Promise<void> {
  const supabase = createSupabaseServerClient();
  const { error } = await supabase.from("phases_planning").insert(rows);
  if (!error) return;
  if (isMissingColumnError(error, "heure_debut")) {
    const { error: retry } = await supabase.from("phases_planning").insert(
      rows.map((row) => {
        const payload = { ...row };
        delete (payload as { heure_debut?: string }).heure_debut;
        return payload;
      }),
    );
    if (retry) throw wrapSupabaseError(retry);
    return;
  }
  if (isMissingColumnError(error, "dates_estimatives")) {
    const { error: retry } = await supabase.from("phases_planning").insert(
      rows.map((row) => {
        const payload = { ...row };
        delete (payload as { dates_estimatives?: boolean }).dates_estimatives;
        return payload;
      }),
    );
    if (retry) throw wrapSupabaseError(retry);
    return;
  }
  throw wrapSupabaseError(error);
}

export async function supabaseApplyPhasePatches(
  patches: PhasePatch[],
): Promise<void> {
  const supabase = createSupabaseServerClient();
  for (const patch of patches) {
    const payload: Record<string, unknown> = {
      date_debut: patch.date_debut,
      date_fin: patch.date_fin,
      employe_id: patch.employe_id,
    };
    if (patch.heure_debut !== undefined) payload.heure_debut = patch.heure_debut;
    if (patch.duree_estimee_heures !== undefined) {
      payload.duree_estimee_heures = patch.duree_estimee_heures;
    }
    const { error } = await supabase
      .from("phases_planning")
      .update(payload)
      .eq("id", patch.id);
    if (error) {
      if (
        isMissingColumnError(error, "heure_debut") &&
        patch.heure_debut !== undefined
      ) {
        const retry = await supabase
          .from("phases_planning")
          .update({
            date_debut: patch.date_debut,
            date_fin: patch.date_fin,
            employe_id: patch.employe_id,
          })
          .eq("id", patch.id);
        if (retry.error) throw wrapSupabaseError(retry.error);
        continue;
      }
      throw wrapSupabaseError(error);
    }
  }
}

export async function supabaseCreateSignalement(
  input: NewSignalementInput,
): Promise<void> {
  const supabase = createSupabaseServerClient();
  const payload = {
    employe_id: input.employe_id,
    phase_id: input.phase_id || null,
    retard_demi_journees: input.retard_demi_journees,
    note: input.note,
    statut: input.statut ?? "en_attente",
    sens: input.sens,
    origine: input.origine ?? "salarie",
    proposition: input.proposition ?? null,
  };
  const first = await supabase.from("signalements").insert(payload);
  if (!first.error) return;
  if (isMissingColumnError(first.error, "proposition")) {
    const withoutProp = { ...payload };
    delete (withoutProp as { proposition?: unknown }).proposition;
    const retryProp = await supabase.from("signalements").insert(withoutProp);
    if (!retryProp.error) return;
  }
  const retry = await supabase.from("signalements").insert({
    employe_id: payload.employe_id,
    phase_id: payload.phase_id,
    retard_demi_journees: payload.retard_demi_journees,
    note: payload.note,
    statut: payload.statut,
    sens: payload.sens,
  });
  if (retry.error) throw wrapSupabaseError(first.error);
}

export async function supabaseCreateDemande(
  input: NewDemandeInput & { employe_id: string },
): Promise<void> {
  const supabase = createSupabaseServerClient();
  const message = input.message.trim();
  const payload = {
    employe_id: input.employe_id,
    categorie: input.categorie,
    message,
    statut: "en_attente" as const,
    archivee: false,
    date_debut: input.date_debut?.slice(0, 10) || null,
    date_fin: input.date_fin?.slice(0, 10) || null,
    type_absence: input.type_absence ?? null,
    motif_precision: input.motif_precision?.trim() || null,
    photos: parsePiecesJointes(input.photos),
  };
  let error = (await supabase.from("demandes").insert(payload)).error;
  if (error && isMissingColumnError(error, "photos")) {
    const withoutPhotos = { ...payload };
    delete (withoutPhotos as { photos?: unknown }).photos;
    const retryPhotos = await supabase.from("demandes").insert(withoutPhotos);
    if (!retryPhotos.error) return;
    error = retryPhotos.error;
  }
  if (error && isMissingColumnError(error, "date_debut")) {
    const withoutDates = {
      employe_id: payload.employe_id,
      categorie: payload.categorie,
      message: payload.message,
      statut: payload.statut,
      archivee: payload.archivee,
    };
    const retryDates = await supabase.from("demandes").insert(withoutDates);
    if (!retryDates.error) return;
    if (retryDates.error && isMissingColumnError(retryDates.error, "statut")) {
      const retry = await supabase.from("demandes").insert({
        employe_id: payload.employe_id,
        categorie: payload.categorie,
        message: payload.message,
      });
      if (retry.error) throw wrapSupabaseError(retry.error);
      return;
    }
    throw wrapSupabaseError(retryDates.error);
  }
  if (error && isMissingColumnError(error, "statut")) {
    const retry = await supabase.from("demandes").insert({
      employe_id: payload.employe_id,
      categorie: payload.categorie,
      message: payload.message,
    });
    if (retry.error) throw wrapSupabaseError(retry.error);
    return;
  }
  if (error && isMissingColumnError(error, "archivee")) {
    const retry = await supabase.from("demandes").insert({
      employe_id: payload.employe_id,
      categorie: payload.categorie,
      message: payload.message,
      statut: payload.statut,
    });
    if (retry.error) throw wrapSupabaseError(retry.error);
    return;
  }
  if (error) throw wrapSupabaseError(error);
}

export async function supabaseUpdateDemande(
  input: DemandeUpdateInput,
): Promise<void> {
  const supabase = createSupabaseServerClient();
  const patch: {
    statut?: DemandeUpdateInput["statut"];
    archivee?: boolean;
    motif_refus?: string | null;
    absence_id?: string | null;
  } = {};
  if (input.statut) patch.statut = input.statut;
  if (input.archivee !== undefined) patch.archivee = input.archivee;
  if (input.motif_refus !== undefined) patch.motif_refus = input.motif_refus;
  if (input.absence_id !== undefined) patch.absence_id = input.absence_id;
  if (Object.keys(patch).length === 0) return;
  const { error } = await supabase.from("demandes").update(patch).eq("id", input.id);
  if (error) throw wrapSupabaseError(error);
}

export async function supabaseDeleteDemande(id: string): Promise<void> {
  const supabase = createSupabaseServerClient();
  const { error } = await supabase.from("demandes").delete().eq("id", id);
  if (error) throw wrapSupabaseError(error);
}

export async function supabaseSetSignalementStatut(
  id: string,
  statut: StatutSignalement,
): Promise<void> {
  const supabase = createSupabaseServerClient();
  const { error } = await supabase
    .from("signalements")
    .update({ statut })
    .eq("id", id);
  if (error) throw wrapSupabaseError(error);
}

export async function supabaseCreateReception(
  input: NewReceptionInput,
): Promise<string | undefined> {
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .from("receptions_chantier")
    .insert({
      phase_id: input.phase_id,
      nom_signataire: input.nom_signataire,
      image_signature: input.image_signature,
    })
    .select("id")
    .single();
  if (error) throw wrapSupabaseError(error);
  const { error: phaseError } = await supabase
    .from("phases_planning")
    .update({ statut: "termine" })
    .eq("id", input.phase_id);
  if (phaseError) throw wrapSupabaseError(phaseError);
  return data?.id;
}

export async function supabaseReplaceHoraires(
  rows: HoraireSaison[],
): Promise<void> {
  const supabase = createSupabaseServerClient();
  const { error: delError } = await supabase
    .from("horaires_saisonniers")
    .delete()
    .neq("id", "00000000-0000-0000-0000-000000000000");
  if (delError) throw wrapSupabaseError(delError);
  if (rows.length === 0) return;
  const payload = rows.map((row, index) => ({
    nom: row.nom.trim() || `Période ${index + 1}`,
    debut_mmdd: row.debut_mmdd,
    fin_mmdd: row.fin_mmdd,
    ordre: index,
  }));
  const { error } = await supabase.from("horaires_saisonniers").insert(payload);
  if (error) throw wrapSupabaseError(error);
}

export async function supabaseSetSaisonForcee(
  saison: "ete" | "hiver" | null,
): Promise<void> {
  const supabase = createSupabaseServerClient();
  const { error } = await supabase.from("planning_reglages").upsert({
    id: "default",
    saison_forcee: saison,
  });
  if (error && isMissingSchemaError(error)) return;
  if (error) throw wrapSupabaseError(error);
}

export async function supabaseListSousTraitants(): Promise<SousTraitant[]> {
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .from("sous_traitants")
    .select("*")
    .order("nom");
  if (error) {
    if (isMissingSchemaError(error)) return [];
    throw wrapSupabaseError(error);
  }
  return ((data ?? []) as SousTraitant[]).map((row) => ({
    id: row.id,
    nom: row.nom,
    specialite: row.specialite,
    email: row.email,
    telephone: row.telephone ?? null,
    adresse: row.adresse ?? null,
  }));
}

export async function supabaseUpsertSousTraitant(
  input: Omit<SousTraitant, "id"> & { id?: string },
): Promise<string> {
  const supabase = createSupabaseServerClient();
  const payload = {
    nom: input.nom.trim(),
    specialite: input.specialite.trim(),
    email: input.email.trim(),
    telephone: input.telephone?.trim() || null,
    adresse: input.adresse?.trim() || null,
    updated_at: new Date().toISOString(),
  };
  if (input.id) {
    const { error } = await supabase
      .from("sous_traitants")
      .update(payload)
      .eq("id", input.id);
    if (error) throw wrapSupabaseError(error);
    return input.id;
  }
  const { data, error } = await supabase
    .from("sous_traitants")
    .insert(payload)
    .select("id")
    .single();
  if (error || !data) throw wrapSupabaseError(error ?? new Error("Création impossible."));
  return data.id as string;
}

export async function supabasePatchSousTraitant(
  input: SousTraitantPatch,
): Promise<void> {
  const supabase = createSupabaseServerClient();
  const payload: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };
  if (input.nom !== undefined) payload.nom = input.nom.trim();
  if (input.specialite !== undefined) payload.specialite = input.specialite.trim();
  if (input.email !== undefined) payload.email = input.email.trim();
  if (input.telephone !== undefined) {
    payload.telephone = input.telephone?.trim() || null;
  }
  if (input.adresse !== undefined) payload.adresse = input.adresse?.trim() || null;
  if (Object.keys(payload).length <= 1) return;
  const { error } = await supabase
    .from("sous_traitants")
    .update(payload)
    .eq("id", input.id);
  if (error) throw wrapSupabaseError(error);
}

export async function supabaseDeleteSousTraitant(id: string): Promise<void> {
  const supabase = createSupabaseServerClient();
  const { error } = await supabase.from("sous_traitants").delete().eq("id", id);
  if (error) throw wrapSupabaseError(error);
}

export async function supabaseMarkBonCommande(input: {
  chantierId: string;
  sousTraitantId: string;
  sendDate: string;
}): Promise<void> {
  const supabase = createSupabaseServerClient();
  const { error } = await supabase
    .from("chantiers")
    .update({
      date_bon_commande: input.sendDate,
      sous_traitant_id: input.sousTraitantId,
    })
    .eq("id", input.chantierId);
  if (error && isMissingColumnError(error, "date_bon_commande")) {
    return;
  }
  if (error) throw wrapSupabaseError(error);
}

export async function supabaseConfirmPhaseDates(
  snapshot: PlanningSnapshot,
  ids: string[],
): Promise<void> {
  const unique = Array.from(new Set(ids.filter(Boolean)));
  if (unique.length === 0) return;
  const supabase = createSupabaseServerClient();
  const { error } = await supabase
    .from("phases_planning")
    .update({ dates_estimatives: false, lancement_valide: true })
    .in("id", unique);
  if (error && isMissingColumnError(error, "lancement_valide")) {
    const retry = await supabase
      .from("phases_planning")
      .update({ dates_estimatives: false })
      .in("id", unique);
    if (retry.error && isMissingColumnError(retry.error, "dates_estimatives")) {
      return;
    }
    if (retry.error) throw wrapSupabaseError(retry.error);
  } else if (error && isMissingColumnError(error, "dates_estimatives")) {
    const retryLaunch = await supabase
      .from("phases_planning")
      .update({ lancement_valide: true })
      .in("id", unique);
    if (
      retryLaunch.error &&
      !isMissingColumnError(retryLaunch.error, "lancement_valide")
    ) {
      throw wrapSupabaseError(retryLaunch.error);
    }
  } else if (error) {
    throw wrapSupabaseError(error);
  }
  const next = withConfirmedPhases(snapshot, unique);
  const chantierIds = Array.from(
    new Set(
      unique
        .map((id) => chantierIdForPhase(snapshot, id))
        .filter((id): id is string => Boolean(id)),
    ),
  );
  for (const chantierId of chantierIds) {
    const { error: chantierError } = await supabase
      .from("chantiers")
      .update({
        dates_estimatives: chantierHasEstimativeDates(next, chantierId),
      })
      .eq("id", chantierId);
    if (
      chantierError &&
      !isMissingColumnError(chantierError, "dates_estimatives")
    ) {
      throw wrapSupabaseError(chantierError);
    }
  }
}
