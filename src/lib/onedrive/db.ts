import "server-only";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function updateChantierOnedriveLink(
  chantierId: string,
  shareUrl: string,
): Promise<void> {
  const supabase = createSupabaseServerClient();
  const { error } = await supabase
    .from("chantiers")
    .update({ lien_dossier_onedrive: shareUrl })
    .eq("id", chantierId);
  if (error) throw error;
}

export async function loadChantierLinkByPhase(
  phaseId: string,
): Promise<{
  lien: string | null;
  nomClient: string;
  nomElement: string;
} | null> {
  const supabase = createSupabaseServerClient();
  const { data: phase, error: phaseError } = await supabase
    .from("phases_planning")
    .select("element_id")
    .eq("id", phaseId)
    .maybeSingle();
  if (phaseError || !phase) return null;
  const { data: element } = await supabase
    .from("elements_chantier")
    .select("id, nom_element, chantier_id")
    .eq("id", phase.element_id)
    .maybeSingle();
  if (!element) return null;
  const { data: chantier } = await supabase
    .from("chantiers")
    .select("nom_client, lien_dossier_onedrive")
    .eq("id", element.chantier_id)
    .maybeSingle();
  if (!chantier) return null;
  return {
    lien: chantier.lien_dossier_onedrive,
    nomClient: chantier.nom_client,
    nomElement: element.nom_element,
  };
}

export async function setReceptionOnedriveErreur(
  receptionId: string | undefined,
  phaseId: string,
  message: string | null,
): Promise<void> {
  const supabase = createSupabaseServerClient();
  let query = supabase.from("receptions_chantier").update({
    onedrive_erreur: message,
  });
  query = receptionId ? query.eq("id", receptionId) : query.eq("phase_id", phaseId);
  const { error } = await query;
  if (error && !String(error.message).includes("onedrive_erreur")) {
    throw error;
  }
}
