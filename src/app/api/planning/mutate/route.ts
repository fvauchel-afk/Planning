import { NextRequest, NextResponse } from "next/server";
import { forbidden, getSession, resolveSession, unauthorized } from "@/lib/auth/guard";
import { idsEqual } from "@/lib/auth/ids";
import {
  invalidateSupabaseSnapshotCache,
  supabaseApplyPhasePatches,
  supabaseCreateAbsence,
  supabaseCreateChantier,
  supabaseUpdateChantier,
  supabaseDeleteChantier,
  supabaseScheduleChantierDay,
  supabaseCreateReception,
  supabaseCreateSignalement,
  supabaseDeleteAbsence,
  supabaseReplaceHoraires,
  supabaseSetSignalementStatut,
  supabaseUpsertEmployee,
  fetchSupabaseSnapshot,
} from "@/lib/store/supabase";
import { wrapSupabaseError } from "@/lib/supabase/errors";
import { hasSupabaseServiceRole, isSupabaseUrlConfigured } from "@/lib/supabase/server";
import type {
  HoraireSaison,
  NewAbsenceInput,
  NewChantierInput,
  ChantierUpdateInput,
  ScheduleChantierDayInput,
  NewEmployeeInput,
  NewReceptionInput,
  NewSignalementInput,
  PhasePatch,
  StatutSignalement,
} from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type MutateBody =
  | { action: "createChantier"; input: NewChantierInput }
  | { action: "updateChantier"; input: ChantierUpdateInput }
  | { action: "deleteChantier"; chantierId: string }
  | { action: "scheduleChantierDay"; input: ScheduleChantierDayInput }
  | { action: "createChantierWithPatches"; input: NewChantierInput; patches: PhasePatch[] }
  | { action: "upsertEmployee"; input: NewEmployeeInput & { id?: string } }
  | { action: "createAbsence"; input: NewAbsenceInput }
  | { action: "deleteAbsence"; id: string }
  | { action: "applyPhasePatches"; patches: PhasePatch[] }
  | { action: "createSignalement"; input: NewSignalementInput }
  | { action: "setSignalementStatut"; id: string; statut: StatutSignalement }
  | { action: "validateSignalement"; id: string; patches: PhasePatch[] }
  | { action: "createReception"; input: NewReceptionInput }
  | { action: "saveHoraires"; rows: HoraireSaison[] };

export async function POST(request: NextRequest) {
  const session = await resolveSession(await getSession());
  if (!session) return unauthorized();

  if (isSupabaseUrlConfigured() && !hasSupabaseServiceRole()) {
    return NextResponse.json(
      {
        error:
          "Ajoutez SUPABASE_SERVICE_ROLE_KEY (clé service_role du dashboard Supabase) sur le serveur.",
      },
      { status: 500 },
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
    "createAbsence",
    "deleteAbsence",
    "applyPhasePatches",
    "setSignalementStatut",
    "validateSignalement",
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
    } else if (body.action === "createAbsence") {
      await supabaseCreateAbsence(body.input);
    } else if (body.action === "deleteAbsence") {
      await supabaseDeleteAbsence(body.id);
    } else if (body.action === "applyPhasePatches") {
      await supabaseApplyPhasePatches(body.patches ?? []);
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
