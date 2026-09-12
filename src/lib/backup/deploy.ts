import "server-only";
import { appBuildId } from "@/lib/app-build-id";
import { runPlanningBackup } from "@/lib/backup/run";
import { parseBackupFileName } from "@/lib/backup/meta";
import { listBackupFiles } from "@/lib/onedrive/graph";

let claimedBuild: string | null = null;
let inFlight: Promise<void> | null = null;

function isProductionRuntime(): boolean {
  if (process.env.VERCEL_ENV) return process.env.VERCEL_ENV === "production";
  return Boolean(process.env.VERCEL);
}

export function ensureDeployBackup(): Promise<void> {
  if (inFlight) return inFlight;
  inFlight = runEnsureDeployBackup().finally(() => {
    inFlight = null;
  });
  return inFlight;
}

async function runEnsureDeployBackup(): Promise<void> {
  if (!isProductionRuntime()) return;
  const buildId = appBuildId();
  if (!buildId || buildId === "dev") return;
  const marker = buildId.slice(0, 12);
  if (claimedBuild === marker) return;

  try {
    const files = await listBackupFiles();
    const already = files.some((file) => {
      const info = parseBackupFileName(file.name);
      return info.trigger === "deploy" && info.buildId === marker;
    });
    if (already) {
      claimedBuild = marker;
      return;
    }
    claimedBuild = marker;
    await runPlanningBackup({ trigger: "deploy", buildId });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes("BACKUP_ALREADY_EXISTS")) {
      claimedBuild = marker;
      return;
    }
    claimedBuild = null;
    console.error("[backup] sauvegarde au déploiement", err);
  }
}
