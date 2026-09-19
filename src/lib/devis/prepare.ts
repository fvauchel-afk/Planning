import "server-only";
import { buildDevisPdf } from "@/lib/devis/pdf";
import {
  supabaseGetClient,
  supabaseGetDevis,
  supabaseGetDevisReglages,
  supabaseGetEntreprise,
} from "@/lib/store/devis";

export async function loadDevisBundle(id: string) {
  const devis = await supabaseGetDevis(id);
  if (!devis) throw new Error("Devis introuvable.");
  const client = await supabaseGetClient(devis.client_id);
  if (!client) throw new Error("Fiche client introuvable.");
  const [entreprise, reglages] = await Promise.all([
    supabaseGetEntreprise(),
    supabaseGetDevisReglages(),
  ]);
  const pdf = await buildDevisPdf({ devis, client, entreprise, reglages });
  return { devis, client, entreprise, reglages, ...pdf };
}
