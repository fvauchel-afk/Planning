import "server-only";
import { loadDevisBundle } from "@/lib/devis/prepare";
import { uploadBytesToClientFolder } from "@/lib/onedrive/graph";
import { sanitizeOnedriveName } from "@/lib/onedrive/sanitize";
import { loadOnedriveTokens } from "@/lib/onedrive/tokens";
import { supabasePatchClient, supabaseSetDevisOnedriveFichier } from "@/lib/store/devis";

export function devisOnedriveSousDossier(numero: number): string {
  return sanitizeOnedriveName(`Devis ${numero}`, "Devis");
}

export async function tryArchiveDevisOnOneDrive(id: string): Promise<{
  folder?: string;
  fileName?: string;
  warning?: string;
}> {
  const tokens = await loadOnedriveTokens();
  if (!tokens?.refresh_token) {
    return {
      warning:
        "OneDrive n’est pas connecté. Le devis est créé ; le dossier se fera après connexion, ou à l’envoi.",
    };
  }
  try {
    const bundle = await loadDevisBundle(id);
    const sous = devisOnedriveSousDossier(bundle.devis.numero);
    await uploadBytesToClientFolder({
      nomClient: bundle.client.nom,
      fileName: bundle.fileName,
      bytes: bundle.bytes,
      contentType: "application/pdf",
      sousDossier: sous,
    });
    await supabaseSetDevisOnedriveFichier(id, bundle.fileName);
    if (!bundle.client.lien_dossier_onedrive) {
      try {
        await supabasePatchClient({ id: bundle.client.id, lien_dossier_onedrive: bundle.client.nom });
      } catch {
        // lien optionnel
      }
    }
    return {
      folder: `${bundle.client.nom} / ${sous}`,
      fileName: bundle.fileName,
    };
  } catch (err) {
    return {
      warning: err instanceof Error ? err.message : "Copie OneDrive impossible.",
    };
  }
}
