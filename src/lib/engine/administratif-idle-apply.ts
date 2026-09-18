import "server-only";
import { administratifIdlePlans } from "@/lib/engine/administratif-idle";
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
import type { PlanningSnapshot } from "@/lib/types";

/** Crée les blocs Administratif (7 jours vides, pas d’urgence) sans attendre une validation. */
export async function applyAdministratifIdleAutofill(
  snapshot: PlanningSnapshot,
): Promise<PlanningSnapshot> {
  if (hasPendingSignalements(snapshot)) return snapshot;

  let changed = false;
  for (const item of snapshot.signalements ?? []) {
    if (item.statut !== "en_attente") continue;
    if (!isAdministratifIdleSuggestion(item)) continue;
    const input = parseProposition(item.proposition)?.createChantier;
    if (!input) continue;
    await supabaseCreateChantier(input);
    await supabaseSetSignalementStatut(item.id, "valide");
    changed = true;
  }

  const current = changed ? await fetchSupabaseSnapshot() : snapshot;
  for (const plan of administratifIdlePlans(current)) {
    await supabaseCreateChantier(plan.input);
    changed = true;
  }
  if (!changed) return snapshot;
  return fetchSupabaseSnapshot();
}
