import "server-only";
import { downloadBackupJson } from "@/lib/onedrive/graph";
import { isMissingSchemaError } from "@/lib/supabase/errors";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function restorePlanningBackup(itemId: string): Promise<{
  restored: Record<string, number>;
}> {
  const text = await downloadBackupJson(itemId);
  let payload: unknown;
  try {
    payload = JSON.parse(text) as unknown;
  } catch {
    throw new Error("Le fichier de sauvegarde n’est pas un JSON lisible.");
  }
  if (
    !payload ||
    typeof payload !== "object" ||
    (payload as { app?: string }).app !== "planning-vauchel"
  ) {
    throw new Error("Ce fichier n’est pas une sauvegarde Planning Vauchel.");
  }

  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase.rpc("restore_planning_backup", {
    payload,
  });
  if (error) {
    if (isMissingSchemaError(error) || /restore_planning_backup/i.test(error.message)) {
      throw new Error(
        "La fonction de restauration n’est pas encore installée. Exécutez supabase/migrations/019_restore_planning_backup.sql dans l’éditeur SQL Supabase.",
      );
    }
    throw error;
  }
  const restored =
    data && typeof data === "object" && "restored" in data
      ? ((data as { restored?: Record<string, number> }).restored ?? {})
      : {};
  return { restored };
}
