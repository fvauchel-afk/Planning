import "server-only";
import {
  administratifIdlePlans,
  employeeHasChantierInWindow,
} from "@/lib/engine/administratif-idle";
import {
  fetchSupabaseSnapshot,
  supabaseCreateChantier,
  supabaseCreateSignalement,
} from "@/lib/store/supabase";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  isMissingSchemaError,
  supabaseErrorInfo,
  wrapSupabaseError,
} from "@/lib/supabase/errors";

async function tryClaimAdministratifIdle(
  employeeId: string,
  windowFrom: string,
): Promise<boolean> {
  const supabase = createSupabaseServerClient();
  const inserted = await supabase
    .from("administratif_idle_claims")
    .insert({ employee_id: employeeId, window_from: windowFrom })
    .select("employee_id")
    .maybeSingle();
  if (!inserted.error) return Boolean(inserted.data);
  const info = supabaseErrorInfo(inserted.error);
  if (info.code === "23505") return false;
  if (isMissingSchemaError(inserted.error)) {
    console.warn(
      "[administratif-idle] table administratif_idle_claims absente — risque de doublon",
    );
    return true;
  }
  throw wrapSupabaseError(inserted.error);
}

async function attachClaimChantier(
  employeeId: string,
  windowFrom: string,
  chantierId: string,
) {
  const supabase = createSupabaseServerClient();
  await supabase
    .from("administratif_idle_claims")
    .update({ chantier_id: chantierId })
    .eq("employee_id", employeeId)
    .eq("window_from", windowFrom);
}

export async function applyAdministratifIdleChoice(input: {
  employeeId: string;
  decision: "create" | "dismiss";
  createdBy: string;
}): Promise<{ chantierId?: string }> {
  const snapshot = await fetchSupabaseSnapshot();
  const plan = administratifIdlePlans(snapshot).find(
    (item) => item.employeeId === input.employeeId,
  );
  if (!plan) {
    throw new Error(
      "Aucun bloc Administratif à proposer pour ce salarié (rôle, déjà occupé ou déjà ignoré).",
    );
  }

  if (input.decision === "dismiss") {
    await supabaseCreateSignalement({
      employe_id: plan.employeeId,
      phase_id: null,
      retard_demi_journees: 1,
      sens: "retard",
      note: `Proposition Administratif ignorée (${plan.from}).`,
      origine: "decalage_admin",
      statut: "rejete",
      proposition: plan.proposition,
    });
    return {};
  }

  if (!(await tryClaimAdministratifIdle(plan.employeeId, plan.from))) {
    throw new Error("Ce bloc Administratif est déjà en cours de création.");
  }
  const current = await fetchSupabaseSnapshot();
  if (employeeHasChantierInWindow(current, plan.employeeId, plan.from, plan.to)) {
    throw new Error("Ce salarié a déjà un chantier sur les 7 prochains jours.");
  }
  const chantierId = await supabaseCreateChantier(plan.input, input.createdBy);
  await attachClaimChantier(plan.employeeId, plan.from, chantierId);
  return { chantierId };
}
