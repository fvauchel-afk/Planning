import "server-only";
import { waitUntil } from "@vercel/functions";
import { tryArchiveDevisOnOneDrive } from "@/lib/devis/onedrive-archive";
import {
  listChantiersMissingOnedriveLink,
  listDevisMissingOnedriveFichier,
  updateChantierOnedriveLink,
} from "@/lib/onedrive/db";
import { ensureClientFolderShareUrl } from "@/lib/onedrive/graph";
import { loadOnedriveTokens } from "@/lib/onedrive/tokens";

export const CATCH_UP_BATCH = 8;
const CATCH_UP_DEADLINE_MS = 45_000;

export type OnedriveCatchUpResult = {
  skipped?: boolean;
  folders: number;
  devis: number;
  remainingFolders: number;
  remainingDevis: number;
  errors: string[];
};

export async function catchUpOnedriveBatch(
  limit = CATCH_UP_BATCH,
): Promise<OnedriveCatchUpResult> {
  const tokens = await loadOnedriveTokens();
  if (!tokens?.refresh_token) {
    return {
      skipped: true,
      folders: 0,
      devis: 0,
      remainingFolders: 0,
      remainingDevis: 0,
      errors: ["OneDrive n’est pas connecté."],
    };
  }

  const errors: string[] = [];
  let folders = 0;
  let devis = 0;
  const cap = Math.max(1, Math.min(limit, 20));
  let folderBudget = cap;
  let devisBudget = cap;

  const missingFolders = await listChantiersMissingOnedriveLink().catch((err) => {
    errors.push(
      err instanceof Error ? err.message : "Lecture des chantiers impossible.",
    );
    return [] as { id: string; nom_client: string }[];
  });
  const todoFolders = missingFolders.slice(0, folderBudget);
  for (const chantier of todoFolders) {
    try {
      const shareUrl = await ensureClientFolderShareUrl(chantier.nom_client);
      await updateChantierOnedriveLink(chantier.id, shareUrl);
      folders += 1;
    } catch (err) {
      errors.push(
        `${chantier.nom_client} : ${
          err instanceof Error ? err.message : "dossier impossible"
        }`,
      );
    }
  }
  folderBudget = Math.max(0, cap - folders);

  const missingDevis = await listDevisMissingOnedriveFichier().catch((err) => {
    errors.push(
      err instanceof Error ? err.message : "Lecture des devis impossible.",
    );
    return [] as { id: string }[];
  });
  const todoDevis = missingDevis.slice(0, Math.min(devisBudget, folderBudget + 4));
  for (const row of todoDevis) {
    try {
      const archive = await tryArchiveDevisOnOneDrive(row.id);
      if (archive.warning) {
        errors.push(`Devis ${row.id.slice(0, 8)} : ${archive.warning}`);
      } else {
        devis += 1;
      }
    } catch (err) {
      errors.push(
        `Devis ${row.id.slice(0, 8)} : ${
          err instanceof Error ? err.message : "copie impossible"
        }`,
      );
    }
  }

  return {
    folders,
    devis,
    remainingFolders: Math.max(0, missingFolders.length - todoFolders.length),
    remainingDevis: Math.max(0, missingDevis.length - todoDevis.length),
    errors: errors.slice(0, 8),
  };
}

export async function catchUpOnedriveUntilDeadline(
  deadlineMs = Date.now() + CATCH_UP_DEADLINE_MS,
): Promise<OnedriveCatchUpResult> {
  const total: OnedriveCatchUpResult = {
    folders: 0,
    devis: 0,
    remainingFolders: 0,
    remainingDevis: 0,
    errors: [],
  };
  while (Date.now() < deadlineMs) {
    const batch = await catchUpOnedriveBatch();
    total.folders += batch.folders;
    total.devis += batch.devis;
    total.remainingFolders = batch.remainingFolders;
    total.remainingDevis = batch.remainingDevis;
    total.skipped = batch.skipped;
    for (const message of batch.errors) {
      if (!total.errors.includes(message)) total.errors.push(message);
    }
    if (batch.skipped) break;
    if (batch.remainingFolders === 0 && batch.remainingDevis === 0) break;
    if (batch.folders === 0 && batch.devis === 0) break;
  }
  total.errors = total.errors.slice(0, 8);
  return total;
}

export function scheduleOnedriveCatchUp(): void {
  const run = catchUpOnedriveUntilDeadline().catch(() => undefined);
  try {
    waitUntil(run);
  } catch {
    void run;
  }
}
