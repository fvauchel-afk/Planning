import "server-only";
import { asAdminFlag } from "@/lib/auth/ids";
import { chantierHasEstimativeDates, chantierIdForPhase, phaseIdsStartedToday, withConfirmedPhases } from "@/lib/dates-estimatives";
import { parseProposition } from "@/lib/signalements";
import { phaseTypeForRoles } from "@/lib/chantier-status";
import { normalizePhasesForPlanning } from "@/lib/engine/normalize-phases";
import {
  isUnplacedDatedPhase,
  scheduleChantierSlotDays,
  schedulePhaseInserts,
} from "@/lib/engine/schedule-chantier";
import { compareEmployeesByOrdre, ordreAffichageFromNom } from "@/lib/display-order";
import { defaultHoraires, normalizeHoraire, normalizeHorairesEmploye } from "@/lib/engine/hours";
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
  NewChantierInput,
  ChantierUpdateInput,
  ScheduleChantierDayInput,
  NewEmployeeInput,
  NewReceptionInput,
  NewDemandeInput,
  DemandeUpdateInput,
  NewSignalementInput,
  PhaseEdits,
  PhaseInsert,
  PhasePatch,
  PhasePlanning,
  PlanningSnapshot,
  ReceptionChantier,
  Demande,
  CategorieDemande,
  StatutDemande,
  Role,
  Signalement,
  StatutSignalement,
  TypePhase,
  SousTraitant,
} from "@/lib/types";
import { TYPES_PHASE } from "@/lib/types";

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
const SNAPSHOT_TTL_MS = 2500;

export function invalidateSupabaseSnapshotCache() {
  lastSnapshot = null;
  inflightSnapshot = null;
}

export async function fetchSupabaseSnapshot(): Promise<PlanningSnapshot> {
  if (lastSnapshot && Date.now() - lastSnapshot.at < SNAPSHOT_TTL_MS) {
    return lastSnapshot.data;
  }
  if (!inflightSnapshot) {
    inflightSnapshot = fetchSupabaseSnapshotOnce()
      .then((data) => {
        lastSnapshot = { at: Date.now(), data };
        return data;
      })
      .finally(() => {
        inflightSnapshot = null;
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
    supabase.from("sous_traitants").select("*").order("nom"),
  ]);
  const [signalements, receptions, demandes, sousTraitants] = extra;

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
        const categorie: CategorieDemande =
          row.categorie === "suggestion_entreprise"
            ? "suggestion_entreprise"
            : row.categorie === "suggestion_site"
              ? "suggestion_site"
              : "commande";
        const statut: StatutDemande =
          row.statut === "traite" ? "traite" : "en_attente";
        return {
          id: row.id,
          employe_id: row.employe_id,
          categorie,
          message: row.message ?? "",
          date_creation: row.date_creation,
          statut,
          archivee: Boolean(row.archivee),
        };
      })
      .sort(
        (left, right) =>
          Date.parse(right.date_creation) - Date.parse(left.date_creation),
      ),
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

export async function supabaseCreateChantier(
  input: NewChantierInput,
): Promise<string> {
  const supabase = createSupabaseServerClient();
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
      input.priorite === "pas_presse"
        ? Math.min(180, Math.max(1, Number(input.tolerance_deplacement_jours) || 30))
        : null,
    adresse_livraison: input.avec_livraison ? input.adresse_livraison ?? null : null,
    telephone_livraison: input.avec_livraison
      ? input.telephone_livraison ?? null
      : null,
    sous_traitant_id: input.avec_thermolaquage
      ? input.sous_traitant_id || null
      : null,
  };
  let inserted = await supabase
    .from("chantiers")
    .insert(payload)
    .select("id")
    .single();
  if (inserted.error && isMissingColumnError(inserted.error, "sous_traitant_id")) {
    const { sous_traitant_id: _ignored, ...withoutSt } = payload;
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

    const uniqueByType = new Map<TypePhase, (typeof phases)[number]>();
    for (const phase of phases) {
      uniqueByType.set(phase.type_phase, phase);
    }
    const rows = Array.from(uniqueByType.values()).map((phase) => ({
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
      input.priorite === "pas_presse"
        ? Math.min(180, Math.max(1, Number(input.tolerance_deplacement_jours) || 30))
        : null;
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

export async function supabaseUpsertEmployee(
  input: NewEmployeeInput & { id?: string },
): Promise<void> {
  const supabase = createSupabaseServerClient();
  const payload: Record<string, unknown> = {
    nom: input.nom,
    roles: input.roles,
    actif: input.actif,
    horaires: normalizeHorairesEmploye(input.horaires),
    is_admin: Boolean(input.is_admin),
  };
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
        isMissingColumnError(error, "ordre_affichage")
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
        isMissingColumnError(error, "ordre_affichage")
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
  const pin = input.pin?.trim();
  if (pin && employeeId) {
    const { error: pinError } = await supabase.rpc("set_employee_pin", {
      p_id: employeeId,
      p_pin: pin,
    });
    if (pinError) throw wrapSupabaseError(pinError);
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
): Promise<void> {
  const supabase = createSupabaseServerClient();
  const { error } = await supabase.from("absences").insert({
    employe_id: input.employe_id,
    date_debut: input.date_debut,
    date_fin: input.date_fin,
    type: input.type,
    motif_precision:
      input.type === "autre" ? input.motif_precision?.trim() || null : null,
  });
  if (error) throw wrapSupabaseError(error);
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
  };
  const { error } = await supabase.from("demandes").insert(payload);
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
  const patch: { statut?: StatutDemande; archivee?: boolean } = {};
  if (input.statut) patch.statut = input.statut;
  if (input.archivee !== undefined) patch.archivee = input.archivee;
  if (Object.keys(patch).length === 0) return;
  const { error } = await supabase.from("demandes").update(patch).eq("id", input.id);
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
    .update({ dates_estimatives: false })
    .in("id", unique);
  if (error && isMissingColumnError(error, "dates_estimatives")) return;
  if (error) throw wrapSupabaseError(error);
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
