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
  supabaseDeleteChantier,
  supabaseScheduleChantierDay,
  supabaseCreateReception,
  supabaseCreateSignalement,
  supabaseCreateDemande,
  supabaseUpdateDemande,
  supabaseDeleteAbsence,
  supabaseReplaceHoraires,
  supabaseSetSignalementStatut,
  supabaseUpsertEmployee,
  supabaseReorderEmployees,
  fetchSupabaseSnapshot,
} from "@/lib/store/supabase";
import {
  DATABASE_UNAVAILABLE_MESSAGE,
  wrapSupabaseError,
} from "@/lib/supabase/errors";
import { hasSupabaseServiceRole, isSupabaseUrlConfigured } from "@/lib/supabase/server";
import type {
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
  PhasePatch,
  StatutSignalement,
} from "@/lib/types";
import { CATEGORIES_DEMANDE, STATUTS_DEMANDE } from "@/lib/types";
import { canReceiveCommandes } from "@/lib/auth/commande-access";
import { sendCommandePush } from "@/lib/push/send";
import {
  COMMANDE_MAIL_TEMPLATES,
  sendCommandeMailboxMessage,
} from "@/lib/mail/commande";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type MutateBody =
  | { action: "createChantier"; input: NewChantierInput }
  | { action: "updateChantier"; input: ChantierUpdateInput }
  | { action: "deleteChantier"; chantierId: string }
  | { action: "scheduleChantierDay"; input: ScheduleChantierDayInput }
  | { action: "createChantierWithPatches"; input: NewChantierInput; patches: PhasePatch[] }
  | { action: "upsertEmployee"; input: NewEmployeeInput & { id?: string } }
  | {
      action: "reorderEmployees";
      rows: { id: string; ordre_affichage: number }[];
    }
  | { action: "createAbsence"; input: NewAbsenceInput }
  | { action: "updateAbsence"; input: AbsenceUpdateInput }
  | { action: "deleteAbsence"; id: string }
  | { action: "applyPhasePatches"; patches: PhasePatch[] }
  | { action: "applyPhaseEdits"; edits: PhaseEdits }
  | { action: "createSignalement"; input: NewSignalementInput }
  | { action: "setSignalementStatut"; id: string; statut: StatutSignalement }
  | { action: "validateSignalement"; id: string; patches: PhasePatch[] }
  | { action: "createReception"; input: NewReceptionInput }
  | { action: "createDemande"; input: NewDemandeInput }
  | { action: "updateDemande"; input: DemandeUpdateInput }
  | {
      action: "sendDemandeMail";
      id: string;
      templateId: string;
    }
  | { action: "saveHoraires"; rows: HoraireSaison[] };

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
    "deleteChantier",
    "scheduleChantierDay",
    "createChantierWithPatches",
    "upsertEmployee",
    "reorderEmployees",
    "createAbsence",
    "updateAbsence",
    "deleteAbsence",
    "applyPhasePatches",
    "applyPhaseEdits",
    "setSignalementStatut",
    "validateSignalement",
    "updateDemande",
    "sendDemandeMail",
    "saveHoraires",
  ]);

  if (adminOnly.has(body.action) && !session.isAdmin) {
    return forbidden();
  }

  try {
    let chantierId: string | undefined;

    if (body.action === "createChantier") {
      chantierId = await supabaseCreateChantier(body.input);
    } else if (body.action === "updateChantier") {
      await supabaseUpdateChantier(body.input);
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
      if (body.patches?.length) await supabaseApplyPhasePatches(body.patches);
      chantierId = await supabaseCreateChantier(body.input);
    } else if (body.action === "upsertEmployee") {
      const pin = body.input.pin?.trim();
      if (pin && !/^\d{4}$/.test(pin)) {
        return NextResponse.json(
          { error: "Le code PIN doit contenir 4 chiffres." },
          { status: 400 },
        );
      }
      await supabaseUpsertEmployee(body.input);
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
      await supabaseCreateAbsence(body.input);
    } else if (body.action === "updateAbsence") {
      await supabaseUpdateAbsence(body.input);
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
    } else if (body.action === "setSignalementStatut") {
      await supabaseSetSignalementStatut(body.id, body.statut);
    } else if (body.action === "validateSignalement") {
      if (body.patches?.length) await supabaseApplyPhasePatches(body.patches);
      await supabaseSetSignalementStatut(body.id, "valide");
    } else if (body.action === "createReception") {
      if (!session.isAdmin) {
        const snapshot = await fetchSupabaseSnapshot();
        const phase = snapshot.phases.find(
          (item) => item.id === body.input.phase_id,
        );
        if (
          !phase ||
          !idsEqual(phase.employe_id, session.employeeId) ||
          phase.type_phase !== "pose"
        ) {
          return forbidden("Réception impossible pour cette pose.");
        }
      }
      await supabaseCreateReception(body.input);
    } else if (body.action === "createDemande") {
      const message = body.input.message?.trim() ?? "";
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
      await supabaseCreateDemande({
        categorie: body.input.categorie,
        message,
        employe_id: session.employeeId,
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
        demande?.categorie === "commande" &&
        !canReceiveCommandes(session.nom)
      ) {
        return forbidden("Seuls Alexis et Mika traitent les commandes.");
      }
      await supabaseUpdateDemande({
        id: body.input.id,
        statut: body.input.statut,
        archivee: body.input.archivee,
      });
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
    } else {
      return NextResponse.json({ error: "Action inconnue." }, { status: 400 });
    }

    invalidateSupabaseSnapshotCache();
    return NextResponse.json({ ok: true, chantierId });
  } catch (err) {
    return NextResponse.json(
      { error: wrapSupabaseError(err).message },
      { status: 500 },
    );
  }
}
