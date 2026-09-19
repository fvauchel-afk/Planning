import "server-only";
import {
  administratifIdlePlans,
  employeeHasChantierInWindow,
} from "@/lib/engine/administratif-idle";
import {
  hasPendingSignalements,
  isAdministratifIdleSuggestion,
  parseProposition,
} from "@/lib/signalements";
import {
  fetchSupabaseSnapshot,
  supabaseCreateChantier,
  supabaseSetSignalementStatut,
} from "@/lib/store/supabase";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  isMissingSchemaError,
  supabaseErrorInfo,
  wrapSupabaseError,
} from "@/lib/supabase/errors";
import type { PlanningSnapshot } from "@/lib/types";
import { CREATED_BY_AUTOMATIQUE } from "@/lib/chantier-origine";

/** true = on a le droit de créer ; false = déjà pris par une autre requête. */
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

/** Crée les blocs Administratif (7 jours vides, pas d’urgence) sans attendre une validation. */
export async function applyAdministratifIdleAutofill(
  snapshot: PlanningSnapshot,
): Promise<PlanningSnapshot> {
  if (hasPendingSignalements(snapshot)) return snapshot;

  let changed = false;
  for (const item of snapshot.signalements ?? []) {
    if (item.statut !== "en_attente") continue;
    if (!isAdministratifIdleSuggestion(item)) continue;
    const proposition = parseProposition(item.proposition);
    const input = proposition?.createChantier;
    if (!input) continue;
    const windowFrom = proposition?.from;
    if (
      windowFrom &&
      !(await tryClaimAdministratifIdle(item.employe_id, windowFrom))
    ) {
      await supabaseSetSignalementStatut(item.id, "valide");
      continue;
    }
    const chantierId = await supabaseCreateChantier(
      input,
      CREATED_BY_AUTOMATIQUE,
    );
    if (windowFrom && chantierId) {
      await attachClaimChantier(item.employe_id, windowFrom, chantierId);
    }
    await supabaseSetSignalementStatut(item.id, "valide");
    changed = true;
  }

  let current = changed ? await fetchSupabaseSnapshot() : snapshot;
  for (const plan of administratifIdlePlans(current)) {
    if (!(await tryClaimAdministratifIdle(plan.employeeId, plan.from))) {
      continue;
    }
    current = await fetchSupabaseSnapshot();
    if (employeeHasChantierInWindow(current, plan.employeeId, plan.from, plan.to)) {
      continue;
    }
    const chantierId = await supabaseCreateChantier(
      plan.input,
      CREATED_BY_AUTOMATIQUE,
    );
    if (chantierId) {
      await attachClaimChantier(plan.employeeId, plan.from, chantierId);
    }
    changed = true;
  }
  if (!changed) return snapshot;
  return fetchSupabaseSnapshot();
}
