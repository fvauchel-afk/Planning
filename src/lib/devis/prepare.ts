import "server-only";
import { buildDevisPdf } from "@/lib/devis/pdf";
import { supabaseGetClient, supabaseGetDevis } from "@/lib/store/devis";

export async function loadDevisWithClient(id: string) {
  const devis = await supabaseGetDevis(id);
  if (!devis) throw new Error("Devis introuvable.");
  const client = await supabaseGetClient(devis.client_id);
  if (!client) throw new Error("Fiche client introuvable.");
  return { devis, client };
}

export async function previewDevisPdf(id: string) {
  const { devis, client } = await loadDevisWithClient(id);
  const pdf = await buildDevisPdf({ devis, client });
  return { devis, client, ...pdf };
}
