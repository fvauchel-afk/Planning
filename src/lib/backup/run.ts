import "server-only";
import { CHANGELOG } from "@/data/changelog";
import { appBuildId } from "@/lib/app-build-id";
import { latestChangelog, type BackupTrigger } from "@/lib/backup/meta";
import { uploadJsonToBackupFolder } from "@/lib/onedrive/graph";
import { loadOnedriveTokens } from "@/lib/onedrive/tokens";
import { isMissingSchemaError } from "@/lib/supabase/errors";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const TABLES = [
  "employees",
  "chantiers",
  "elements_chantier",
  "phases_planning",
  "absences",
  "signalements",
  "receptions_chantier",
  "horaires_saisonniers",
  "types_contrat",
] as const;

export type BackupTableName = (typeof TABLES)[number];

export type BackupResult = {
  fileName: string;
  uploadedName: string;
  createdAt: string;
  counts: Record<BackupTableName, number>;
  totalRows: number;
  trigger: BackupTrigger;
};

export type BackupRunOptions = {
  trigger?: BackupTrigger;
  buildId?: string;
};

const PAGE_SIZE = 1000;

async function fetchAllRows(
  table: BackupTableName,
): Promise<{ rows: unknown[]; missing: boolean }> {
  const supabase = createSupabaseServerClient();
  const rows: unknown[] = [];
  let from = 0;
  for (;;) {
    const { data, error } = await supabase
      .from(table)
      .select("*")
      .range(from, from + PAGE_SIZE - 1);
    if (error) {
      if (isMissingSchemaError(error)) return { rows: [], missing: true };
      throw error;
    }
    const page = data ?? [];
    rows.push(...page);
    if (page.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }
  return { rows, missing: false };
}

function parisStamp(date: Date): { day: string; time: string } {
  const parts = new Intl.DateTimeFormat("fr-FR", {
    timeZone: "Europe/Paris",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";
  return {
    day: `${get("year")}-${get("month")}-${get("day")}`,
    time: `${get("hour").padStart(2, "0")}${get("minute").padStart(2, "0")}`,
  };
}

function backupFileName(options: {
  trigger: BackupTrigger;
  buildId: string;
  changelogId: string;
}): string {
  const stamp = parisStamp(new Date());
  if (options.trigger === "deploy") {
    return `sauvegarde__deploy__${options.buildId.slice(0, 12)}__${options.changelogId}.json`;
  }
  if (options.trigger === "daily") {
    return `sauvegarde-${stamp.day}-${stamp.time}__quotidienne.json`;
  }
  return `sauvegarde-${stamp.day}-${stamp.time}__manuelle.json`;
}

export async function runPlanningBackup(
  options: BackupRunOptions = {},
): Promise<BackupResult> {
  const tokens = await loadOnedriveTokens();
  if (!tokens?.refresh_token) {
    throw new Error(
      "OneDrive n’est pas connecté. Ouvrez /admin/onedrive avant de lancer une sauvegarde.",
    );
  }

  const trigger = options.trigger ?? "manual";
  const buildId = options.buildId || appBuildId();
  const changelog = latestChangelog();
  const createdAt = new Date().toISOString();
  const tables: Record<string, unknown[]> = {};
  const counts = {} as Record<BackupTableName, number>;
  const missing: string[] = [];

  for (const table of TABLES) {
    const { rows, missing: tableMissing } = await fetchAllRows(table);
    tables[table] = rows;
    counts[table] = rows.length;
    if (tableMissing) missing.push(table);
  }

  const payload = {
    app: "planning-vauchel",
    created_at: createdAt,
    timezone: "Europe/Paris",
    trigger,
    build_id: buildId,
    changelog_id: changelog?.id ?? null,
    changelog_title: changelog?.title ?? null,
    changelog: CHANGELOG.slice(0, 1),
    tables,
    missing_tables: missing,
  };

  const fileName = backupFileName({
    trigger,
    buildId,
    changelogId: changelog?.id ?? "version",
  });
  const uploaded = await uploadJsonToBackupFolder({
    fileName,
    jsonText: `${JSON.stringify(payload, null, 2)}\n`,
    failIfExists: trigger === "deploy",
  });

  const totalRows = TABLES.reduce((sum, table) => sum + counts[table], 0);
  return {
    fileName: uploaded.name,
    uploadedName: uploaded.name,
    createdAt,
    counts,
    totalRows,
    trigger,
  };
}
