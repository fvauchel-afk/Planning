import "server-only";
import { asAdminFlag } from "@/lib/auth/ids";
import { phaseTypeForRoles } from "@/lib/chantier-status";
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
  NewChantierInput,
  ChantierUpdateInput,
  ScheduleChantierDayInput,
  NewEmployeeInput,
  NewReceptionInput,
  NewSignalementInput,
  PhasePatch,
  PhasePlanning,
  PlanningSnapshot,
  ReceptionChantier,
  Role,
  Signalement,
  StatutSignalement,
  TypePhase,
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
  ]);
  const [signalements, receptions] = extra;

  const signalementRows = isMissingSchemaError(signalements.error)
    ? []
    : signalements.error
      ? (() => {
          throw wrapSupabaseError(signalements.error);
        })()
      : ((signalements.data ?? []) as Signalement[]);

  return {
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
    })),
    elements: (elements.data ?? []) as ElementChantier[],
    phases: ((phases.data ?? []) as PhasePlanning[]).map((phase) => ({
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
    })),
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
        retard_demi_journees: Number(item.retard_demi_journees),
        date_creation: item.date_creation,
        sens: item.sens === "avance" ? "avance" : "retard",
        origine: item.origine === "decalage_admin" ? "decalage_admin" : "salarie",
      };
    }),
    receptions: optionalTable<ReceptionChantier>(receptions).map((row) => ({
      ...row,
      onedrive_erreur: row.onedrive_erreur ?? null,
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
  const { data: chantier, error: chantierError } = await supabase
    .from("chantiers")
    .insert({
      nom_client: input.nom_client,
      adresse: input.adresse,
      lien_dossier_onedrive: input.lien_dossier_onedrive,
      priorite: input.priorite,
    })
    .select("id")
    .single();
  if (chantierError || !chantier) {
    throw wrapSupabaseError(chantierError ?? new Error("Création du chantier impossible."));
  }

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
          }));

    const rows = phases.map((phase) => ({
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
    }));
    const { error: phaseError } = await supabase.from("phases_planning").insert(rows);
    if (phaseError) {
      if (isMissingColumnError(phaseError, "heure_debut")) {
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
  const { error } = await supabase
    .from("chantiers")
    .update({
      nom_client: input.nom_client,
      adresse: input.adresse,
      priorite: input.priorite,
      lien_dossier_onedrive: input.lien_dossier_onedrive,
    })
    .eq("id", input.id);
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

export async function supabaseApplyPhasePatches(
  patches: PhasePatch[],
): Promise<void> {
  const supabase = createSupabaseServerClient();
  for (const patch of patches) {
    const { error } = await supabase
      .from("phases_planning")
      .update({
        date_debut: patch.date_debut,
        date_fin: patch.date_fin,
        employe_id: patch.employe_id,
        ...(patch.heure_debut !== undefined
          ? { heure_debut: patch.heure_debut }
          : {}),
      })
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
    phase_id: input.phase_id,
    retard_demi_journees: input.retard_demi_journees,
    note: input.note,
    statut: input.statut ?? "en_attente",
    sens: input.sens,
    origine: input.origine ?? "salarie",
  };
  const first = await supabase.from("signalements").insert(payload);
  if (!first.error) return;
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
