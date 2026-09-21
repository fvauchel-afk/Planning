import { NextRequest, NextResponse } from "next/server";
import { forbidden, getSession, resolveSession, unauthorized } from "@/lib/auth/guard";
import { idsEqual } from "@/lib/auth/ids";
import {
  invalidateSupabaseSnapshotCache,
  supabaseApplyPhasePatches,
  supabaseApplyPhaseEdits,
  supabaseCreateAbsence,
  supabaseUpdateAbsence,
  supabaseCreateChantier,
  supabaseUpdateChantier,
  supabasePatchChantier,
  supabaseDeleteChantier,
  supabaseScheduleChantierDay,
  supabaseCreateReception,
  supabaseCreateSignalement,
  supabaseCreateDemande,
  supabaseUpdateDemande,
  supabaseDeleteDemande,
  supabaseDeleteAbsence,
  supabasePatchAbsence,
  supabaseReplaceHoraires,
  supabaseSetSaisonForcee,
  supabaseSetSignalementStatut,
  supabaseUpsertEmployee,
  supabasePatchEmployee,
  supabaseReorderEmployees,
  fetchSupabaseSnapshot,
  supabaseConfirmPhaseDates,
  supabaseValidateChantierPlan,
} from "@/lib/store/supabase";
import {
  DATABASE_UNAVAILABLE_MESSAGE,
  wrapSupabaseError,
} from "@/lib/supabase/errors";
import { hasSupabaseServiceRole, isSupabaseUrlConfigured } from "@/lib/supabase/server";
import type {
  Absence,
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
  NewReceptionInput,
  NewDemandeInput,
  DemandeUpdateInput,
  NewSignalementInput,
  PhaseEdits,
  PhasePatch,
  StatutSignalement,
} from "@/lib/types";
import { CATEGORIES_DEMANDE, STATUTS_DEMANDE } from "@/lib/types";
import { canReceiveCommandes } from "@/lib/auth/commande-access";
import { canManageAdministratifIdle } from "@/lib/auth/administratif-idle-access";
import { canManageReunionDirection } from "@/lib/auth/reunion-access";
import { applyAdministratifIdleChoice } from "@/lib/engine/administratif-idle-apply";
import {
  sendCommandePush,
  sendEmployeePush,
  sendSignalementPush,
} from "@/lib/push/send";
import {
  demandePeutEtreSupprimee,
  isReunionDirectionDemande,
  syntheseMessageConge,
  validateDemandeCongeInput,
} from "@/lib/demandes";
import { parsePiecesJointes } from "@/lib/pieces-jointes";
import {
  hasPendingSignalements,
  isAdministratifIdleSuggestion,
  PENDING_CHANTIER_MESSAGE,
} from "@/lib/signalements";
import {
  COMMANDE_MAIL_TEMPLATES,
  sendCommandeMailboxMessage,
} from "@/lib/mail/commande";
import { sendPlanPourMikaEmail } from "@/lib/mail/plan";
import { chantierPlanningInfo } from "@/lib/chantier-status";
import { publicOrigin } from "@/lib/onedrive/oauth-state";
import {
  canSessionFinishPhase,
  planFinishPhase,
} from "@/lib/engine/finish-phase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function notifyPlanPourMika(request: NextRequest, chantierId: string) {
  try {
    const snapshot = await fetchSupabaseSnapshot();
    const chantier = snapshot.chantiers.find((row) => row.id === chantierId);
    if (!chantier) return;
    const info = chantierPlanningInfo(snapshot, chantierId);
    const mail = await sendPlanPourMikaEmail({
      nomClient: chantier.nom_client,
      adresse: chantier.adresse,
      datesLabel: info.rangeLabel,
      onedriveUrl: chantier.lien_dossier_onedrive?.trim() || null,
      ficheUrl: `${publicOrigin(request)}/chantiers?fiche=${encodeURIComponent(chantierId)}`,
    });
    if (mail.warning) console.warn("[plan-mail]", mail.warning);
  } catch (err) {
    console.warn(
      "[plan-mail]",
      err instanceof Error ? err.message : String(err),
    );
  }
}

type MutateBody =
  | { action: "createChantier"; input: NewChantierInput }
  | { action: "updateChantier"; input: ChantierUpdateInput }
  | { action: "patchChantier"; input: ChantierSimplePatch }
  | { action: "deleteChantier"; chantierId: string }
  | { action: "scheduleChantierDay"; input: ScheduleChantierDayInput }
  | { action: "createChantierWithPatches"; input: NewChantierInput; patches: PhasePatch[] }
  | { action: "upsertEmployee"; input: NewEmployeeInput & { id?: string } }
  | { action: "patchEmployee"; input: EmployeePatch }
  | {
      action: "reorderEmployees";
      rows: { id: string; ordre_affichage: number }[];
    }
  | { action: "createAbsence"; input: NewAbsenceInput }
  | { action: "updateAbsence"; input: AbsenceUpdateInput }
  | { action: "patchAbsence"; input: AbsenceSimplePatch }
  | { action: "deleteAbsence"; id: string }
  | { action: "applyPhasePatches"; patches: PhasePatch[] }
  | { action: "applyPhaseEdits"; edits: PhaseEdits }
  | { action: "createSignalement"; input: NewSignalementInput }
  | { action: "setSignalementStatut"; id: string; statut: StatutSignalement }
  | { action: "validateSignalement"; id: string; patches: PhasePatch[]; createChantier?: NewChantierInput | null }
  | { action: "applyAdministratifIdle"; employeeId: string; decision: "create" | "dismiss" }
  | { action: "createReception"; input: NewReceptionInput }
  | { action: "createDemande"; input: NewDemandeInput }
  | { action: "updateDemande"; input: DemandeUpdateInput }
  | { action: "deleteDemande"; id: string }
  | {
      action: "sendDemandeMail";
      id: string;
      templateId: string;
    }
  | { action: "saveHoraires"; rows: HoraireSaison[] }
  | { action: "setSaisonForcee"; saison: "ete" | "hiver" | null }
  | { action: "confirmPhaseDates"; ids: string[] }
  | { action: "validateChantierPlan"; chantierId: string }
  | { action: "finishPhase"; phaseId: string };

export async function POST(request: NextRequest) {
  const session = await resolveSession(await getSession());
  if (!session) return unauthorized();

  if (!isSupabaseUrlConfigured() || !hasSupabaseServiceRole()) {
    return NextResponse.json(
      {
        error: isSupabaseUrlConfigured()
          ? "Ajoutez SUPABASE_SERVICE_ROLE_KEY (clé service_role du dashboard Supabase) sur le serveur."
          : DATABASE_UNAVAILABLE_MESSAGE,
      },
      { status: 503 },
    );
  }

  let body: MutateBody;
  try {
    body = (await request.json()) as MutateBody;
  } catch {
    return NextResponse.json({ error: "Requête invalide." }, { status: 400 });
  }

  const adminOnly = new Set<MutateBody["action"]>([
    "createChantier",
    "updateChantier",
    "patchChantier",
    "deleteChantier",
    "scheduleChantierDay",
    "createChantierWithPatches",
    "upsertEmployee",
    "patchEmployee",
    "reorderEmployees",
    "createAbsence",
    "updateAbsence",
    "patchAbsence",
    "deleteAbsence",
    "applyPhasePatches",
    "applyPhaseEdits",
    "setSignalementStatut",
    "validateSignalement",
    "updateDemande",
    "deleteDemande",
    "sendDemandeMail",
    "saveHoraires",
    "setSaisonForcee",
    "validateChantierPlan",
    "applyAdministratifIdle",
  ]);

  if (adminOnly.has(body.action) && !session.isAdmin) {
    return forbidden();
  }

  try {
    let chantierId: string | undefined;
    let createdForPlanId: string | undefined;
    let createdAbsence: Absence | undefined;
    let skipPlanMail = false;

    if (body.action === "createChantier") {
      const current = await fetchSupabaseSnapshot();
      if (hasPendingSignalements(current)) {
        return NextResponse.json({ error: PENDING_CHANTIER_MESSAGE }, { status: 400 });
      }
      chantierId = await supabaseCreateChantier(body.input, session.nom);
      createdForPlanId = chantierId;
    } else if (body.action === "updateChantier") {
      await supabaseUpdateChantier(body.input);
      chantierId = body.input.id;
    } else if (body.action === "patchChantier") {
      if (!body.input?.id) {
        return NextResponse.json({ error: "Chantier inconnu." }, { status: 400 });
      }
      await supabasePatchChantier(body.input);
      chantierId = body.input.id;
    } else if (body.action === "deleteChantier") {
      await supabaseDeleteChantier(body.chantierId);
    } else if (body.action === "scheduleChantierDay") {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(body.input.date)) {
        return NextResponse.json({ error: "Date invalide." }, { status: 400 });
      }
      if (
        body.input.dateFin &&
        !/^\d{4}-\d{2}-\d{2}$/.test(body.input.dateFin)
      ) {
        return NextResponse.json({ error: "Date de fin invalide." }, { status: 400 });
      }
      await supabaseScheduleChantierDay(body.input);
      chantierId = body.input.chantierId;
    } else if (body.action === "createChantierWithPatches") {
      const current = await fetchSupabaseSnapshot();
      if (hasPendingSignalements(current)) {
        return NextResponse.json({ error: PENDING_CHANTIER_MESSAGE }, { status: 400 });
      }
      if (body.patches?.length) await supabaseApplyPhasePatches(body.patches);
      chantierId = await supabaseCreateChantier(body.input, session.nom);
      createdForPlanId = chantierId;
    } else if (body.action === "upsertEmployee") {
      const pin = body.input.pin?.trim();
      if (pin && !/^\d{4}$/.test(pin)) {
        return NextResponse.json(
          { error: "Le code PIN doit contenir 4 chiffres." },
          { status: 400 },
        );
      }
      await supabaseUpsertEmployee(body.input);
    } else if (body.action === "patchEmployee") {
      if (!body.input?.id) {
        return NextResponse.json({ error: "Salarié inconnu." }, { status: 400 });
      }
      const pin = body.input.pin?.trim();
      if (pin && !/^\d{4}$/.test(pin)) {
        return NextResponse.json(
          { error: "Le code PIN doit contenir 4 chiffres." },
          { status: 400 },
        );
      }
      await supabasePatchEmployee(body.input);
    } else if (body.action === "reorderEmployees") {
      const rows = body.rows ?? [];
      if (!Array.isArray(rows) || rows.length === 0) {
        return NextResponse.json({ error: "Ordre invalide." }, { status: 400 });
      }
      for (const row of rows) {
        if (
          !row?.id ||
          typeof row.ordre_affichage !== "number" ||
          !Number.isFinite(row.ordre_affichage) ||
          row.ordre_affichage < 1 ||
          row.ordre_affichage > 100_000
        ) {
          return NextResponse.json({ error: "Ordre invalide." }, { status: 400 });
        }
      }
      await supabaseReorderEmployees(rows);
    } else if (body.action === "createAbsence") {
      createdAbsence = await supabaseCreateAbsence(body.input);
    } else if (body.action === "updateAbsence") {
      await supabaseUpdateAbsence(body.input);
    } else if (body.action === "patchAbsence") {
      if (!body.input?.id) {
        return NextResponse.json({ error: "Absence inconnue." }, { status: 400 });
      }
      await supabasePatchAbsence(body.input);
    } else if (body.action === "deleteAbsence") {
      await supabaseDeleteAbsence(body.id);
    } else if (body.action === "applyPhasePatches") {
      await supabaseApplyPhasePatches(body.patches ?? []);
    } else if (body.action === "applyPhaseEdits") {
      await supabaseApplyPhaseEdits(body.edits ?? {});
    } else if (body.action === "createSignalement") {
      const input = {
        ...body.input,
        employe_id: session.isAdmin
          ? body.input.employe_id
          : session.employeeId,
      };
      if (!session.isAdmin) {
        const snapshot = await fetchSupabaseSnapshot();
        const phase = snapshot.phases.find((item) => item.id === input.phase_id);
        if (!phase || !idsEqual(phase.employe_id, session.employeeId)) {
          return forbidden("Cette tâche ne vous est pas attribuée.");
        }
      }
      await supabaseCreateSignalement(input);
      if ((input.statut ?? "en_attente") === "en_attente") {
        const snapshot = await fetchSupabaseSnapshot();
        const auteur =
          snapshot.employees.find((item) => idsEqual(item.id, input.employe_id))
            ?.nom || session.nom;
        const resume =
          input.proposition?.message ||
          input.note ||
          "Un signalement attend une validation.";
        const push = await sendSignalementPush({ auteur, resume });
        if (push.warning) console.warn("[signalement-push]", push.warning);
      }
    } else if (body.action === "setSignalementStatut") {
      await supabaseSetSignalementStatut(body.id, body.statut);
    } else if (body.action === "validateSignalement") {
      const current = await fetchSupabaseSnapshot();
      const item = current.signalements.find((row) => row.id === body.id);
      const proposition = item?.proposition;
      const patches =
        body.patches?.length ? body.patches : proposition?.patches ?? [];
      if (patches.length) await supabaseApplyPhasePatches(patches);
      const toCreate =
        body.createChantier === undefined
          ? proposition?.createChantier
          : body.createChantier ?? undefined;
      if (toCreate) {
        const othersPending = hasPendingSignalements({
          ...current,
          signalements: current.signalements.filter((row) => row.id !== body.id),
        });
        if (othersPending && !isAdministratifIdleSuggestion(item ?? {})) {
          return NextResponse.json({ error: PENDING_CHANTIER_MESSAGE }, { status: 400 });
        }
        createdForPlanId = await supabaseCreateChantier(toCreate, session.nom);
        chantierId = createdForPlanId;
        if (isAdministratifIdleSuggestion(item ?? {})) skipPlanMail = true;
      }
      await supabaseSetSignalementStatut(body.id, "valide");
    } else if (body.action === "createReception") {
      const snapshot = await fetchSupabaseSnapshot();
      const phase = snapshot.phases.find(
        (item) => item.id === body.input.phase_id,
      );
      if (
        !phase ||
        (phase.type_phase !== "pose" && phase.type_phase !== "livraison")
      ) {
        return forbidden("Signature impossible pour cette phase.");
      }
      if (
        !session.isAdmin &&
        !idsEqual(phase.employe_id, session.employeeId)
      ) {
        return forbidden("Signature impossible pour cette phase.");
      }
      await supabaseCreateReception(body.input);
    } else if (body.action === "createDemande") {
      if (
        !CATEGORIES_DEMANDE.includes(
          body.input.categorie as (typeof CATEGORIES_DEMANDE)[number],
        )
      ) {
        return NextResponse.json(
          { error: "Catégorie invalide." },
          { status: 400 },
        );
      }
      if (
        body.input.categorie === "reunion_direction" &&
        !canManageReunionDirection(session.nom)
      ) {
        return forbidden(
          "Seuls Jonathan et Mika déposent un sujet de réunion de direction.",
        );
      }
      let message = body.input.message?.trim() ?? "";
      if (body.input.categorie === "conge") {
        const invalid = validateDemandeCongeInput(body.input);
        if (invalid) {
          return NextResponse.json({ error: invalid }, { status: 400 });
        }
        if (!message && body.input.type_absence && body.input.date_debut && body.input.date_fin) {
          message = syntheseMessageConge({
            type_absence: body.input.type_absence,
            date_debut: body.input.date_debut,
            date_fin: body.input.date_fin,
            motif_precision: body.input.motif_precision,
          });
        }
      }
      if (!message) {
        return NextResponse.json(
          { error: "Écrivez un message avant d’envoyer." },
          { status: 400 },
        );
      }
      if (message.length > 4000) {
        return NextResponse.json(
          { error: "Le message est trop long." },
          { status: 400 },
        );
      }
      await supabaseCreateDemande({
        categorie: body.input.categorie,
        message,
        employe_id: session.employeeId,
        date_debut: body.input.date_debut,
        date_fin: body.input.date_fin,
        type_absence: body.input.type_absence,
        motif_precision: body.input.motif_precision,
        photos: parsePiecesJointes(body.input.photos),
      });
      if (body.input.categorie === "commande") {
        const snapshot = await fetchSupabaseSnapshot();
        const auteur =
          snapshot.employees.find((item) =>
            idsEqual(item.id, session.employeeId),
          )?.nom || session.nom;
        const mail = await sendCommandeMailboxMessage({
          templateId: "nouvelle",
          auteur,
          message,
          categorie: "commande",
        });
        if (mail.warning) {
          console.warn("[commande-mail]", mail.warning);
        }
        const push = await sendCommandePush({ auteur, message });
        if (push.warning) {
          console.warn("[commande-push]", push.warning);
        }
      }
    } else if (body.action === "updateDemande") {
      if (!body.input?.id) {
        return NextResponse.json({ error: "Demande inconnue." }, { status: 400 });
      }
      if (
        body.input.statut &&
        !STATUTS_DEMANDE.includes(body.input.statut)
      ) {
        return NextResponse.json({ error: "Statut invalide." }, { status: 400 });
      }
      const current = await fetchSupabaseSnapshot();
      const demande = current.demandes.find((row) => row.id === body.input.id);
      if (
        demande &&
        isReunionDirectionDemande(demande) &&
        !canManageReunionDirection(session.nom)
      ) {
        return forbidden("Seuls Jonathan et Mika gèrent les sujets de réunion.");
      }
      if (
        demande?.categorie === "commande" &&
        !canReceiveCommandes(session.nom)
      ) {
        return forbidden("Seuls Alexis et Mika traitent les commandes.");
      }
      if (
        demande?.categorie === "conge" &&
        body.input.statut === "refusee" &&
        !body.input.motif_refus?.trim()
      ) {
        return NextResponse.json(
          { error: "Indiquez un motif de refus." },
          { status: 400 },
        );
      }
      await supabaseUpdateDemande({
        id: body.input.id,
        statut: body.input.statut,
        archivee: body.input.archivee,
        motif_refus: body.input.motif_refus,
        absence_id: body.input.absence_id,
      });
      if (
        demande?.categorie === "conge" &&
        (body.input.statut === "acceptee" || body.input.statut === "refusee")
      ) {
        const push = await sendEmployeePush({
          employeeId: demande.employe_id,
          title:
            body.input.statut === "acceptee"
              ? "Demande de congé acceptée"
              : "Demande de congé refusée",
          body:
            body.input.statut === "acceptee"
              ? "Votre demande de congé a été acceptée. Consultez Mes congés."
              : `Votre demande de congé a été refusée${
                  body.input.motif_refus?.trim()
                    ? ` : ${body.input.motif_refus.trim().slice(0, 120)}`
                    : "."
                }`,
          url: "/moi/conges",
        });
        if (push.warning) console.warn("[conge-push]", push.warning);
      }
    } else if (body.action === "deleteDemande") {
      if (!body.id) {
        return NextResponse.json({ error: "Demande inconnue." }, { status: 400 });
      }
      const current = await fetchSupabaseSnapshot();
      const demande = current.demandes.find((row) => row.id === body.id);
      if (!demande) {
        return NextResponse.json({ error: "Demande introuvable." }, { status: 404 });
      }
      if (
        demande &&
        isReunionDirectionDemande(demande) &&
        !canManageReunionDirection(session.nom)
      ) {
        return forbidden("Seuls Jonathan et Mika gèrent les sujets de réunion.");
      }
      if (!demandePeutEtreSupprimee(demande)) {
        return NextResponse.json(
          { error: "Seules les demandes déjà traitées peuvent être supprimées." },
          { status: 400 },
        );
      }
      await supabaseDeleteDemande(body.id);
    } else if (body.action === "sendDemandeMail") {
      if (!canReceiveCommandes(session.nom)) {
        return forbidden("Seuls Alexis et Mika envoient ces messages.");
      }
      if (!COMMANDE_MAIL_TEMPLATES.some((item) => item.id === body.templateId)) {
        return NextResponse.json({ error: "Modèle inconnu." }, { status: 400 });
      }
      const current = await fetchSupabaseSnapshot();
      const demande = current.demandes.find((row) => row.id === body.id);
      if (!demande || demande.categorie !== "commande") {
        return NextResponse.json({ error: "Commande introuvable." }, { status: 400 });
      }
      const auteur =
        current.employees.find((item) => item.id === demande.employe_id)?.nom ??
        "Salarié";
      const mail = await sendCommandeMailboxMessage({
        templateId: body.templateId,
        auteur,
        message: demande.message,
        categorie: demande.categorie,
      });
      if (!mail.sent) {
        return NextResponse.json(
          { error: mail.warning || "E-mail non envoyé." },
          { status: 400 },
        );
      }
    } else if (body.action === "saveHoraires") {
      await supabaseReplaceHoraires(body.rows);
    } else if (body.action === "setSaisonForcee") {
      const saison = body.saison;
      if (saison !== null && saison !== "ete" && saison !== "hiver") {
        return NextResponse.json({ error: "Saison inconnue." }, { status: 400 });
      }
      await supabaseSetSaisonForcee(saison);
    } else if (body.action === "confirmPhaseDates") {
      const ids = (body.ids ?? []).filter(Boolean);
      if (ids.length === 0) {
        return NextResponse.json({ error: "Aucune phase à confirmer." }, { status: 400 });
      }
      const current = await fetchSupabaseSnapshot();
      for (const id of ids) {
        const phase = current.phases.find((item) => item.id === id);
        if (!phase) {
          return NextResponse.json({ error: "Phase introuvable." }, { status: 400 });
        }
        if (
          !session.isAdmin &&
          !idsEqual(phase.employe_id, session.employeeId)
        ) {
          return forbidden("Vous ne pouvez confirmer que vos propres phases.");
        }
      }
      await supabaseConfirmPhaseDates(current, ids);
    } else if (body.action === "finishPhase") {
      const phaseId = body.phaseId?.trim();
      if (!phaseId) {
        return NextResponse.json({ error: "Phase inconnue." }, { status: 400 });
      }
      const current = await fetchSupabaseSnapshot();
      const phase = current.phases.find((item) => item.id === phaseId);
      if (!phase) {
        return NextResponse.json({ error: "Phase introuvable." }, { status: 400 });
      }
      if (!canSessionFinishPhase(phase, session)) {
        return forbidden("Vous ne pouvez terminer que vos propres phases.");
      }
      let plan;
      try {
        plan = planFinishPhase(current, phaseId);
      } catch (err) {
        return NextResponse.json(
          {
            error:
              err instanceof Error
                ? err.message
                : "Impossible de terminer cette phase.",
          },
          { status: 400 },
        );
      }
      if (plan.patches.length) await supabaseApplyPhasePatches(plan.patches);
    } else if (body.action === "validateChantierPlan") {
      if (!body.chantierId) {
        return NextResponse.json({ error: "Chantier inconnu." }, { status: 400 });
      }
      const result = await supabaseValidateChantierPlan({
        chantierId: body.chantierId,
        employeId: session.employeeId,
      });
      chantierId = body.chantierId;
      if (result.created) {
        const auteur = session.nom;
        const mail = await sendCommandeMailboxMessage({
          templateId: "nouvelle",
          auteur,
          message: result.message,
          categorie: "commande",
        });
        if (mail.warning) {
          console.warn("[commande-mail]", mail.warning);
        }
        const push = await sendCommandePush({
          auteur,
          message: result.message,
        });
        if (push.warning) {
          console.warn("[commande-push]", push.warning);
        }
      }
    } else if (body.action === "applyAdministratifIdle") {
      if (!canManageAdministratifIdle(session.nom)) {
        return forbidden(
          "Seuls Jonathan, Mika et Alexis peuvent créer un bloc Administratif.",
        );
      }
      if (body.decision !== "create" && body.decision !== "dismiss") {
        return NextResponse.json({ error: "Action inconnue." }, { status: 400 });
      }
      if (!body.employeeId) {
        return NextResponse.json({ error: "Salarié inconnu." }, { status: 400 });
      }
      const result = await applyAdministratifIdleChoice({
        employeeId: body.employeeId,
        decision: body.decision,
        createdBy: session.nom,
      });
      chantierId = result.chantierId;
      skipPlanMail = true;
    } else {
      return NextResponse.json({ error: "Action inconnue." }, { status: 400 });
    }

    if (createdForPlanId && !skipPlanMail) {
      invalidateSupabaseSnapshotCache();
      await notifyPlanPourMika(request, createdForPlanId);
    }

    invalidateSupabaseSnapshotCache();
    return NextResponse.json({ ok: true, chantierId, absence: createdAbsence });
  } catch (err) {
    return NextResponse.json(
      { error: wrapSupabaseError(err).message },
      { status: 500 },
    );
  }
}
