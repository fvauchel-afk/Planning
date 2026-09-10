import "server-only";
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

function parisDateStamp(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Paris",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export async function runPlanningBackup(): Promise<BackupResult> {
  const tokens = await loadOnedriveTokens();
  if (!tokens?.refresh_token) {
    throw new Error(
      "OneDrive n’est pas connecté. Ouvrez /admin/onedrive avant de lancer une sauvegarde.",
    );
  }

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
    tables,
    missing_tables: missing,
  };

  const fileName = `sauvegarde-planning-${parisDateStamp(new Date())}.json`;
  const uploaded = await uploadJsonToBackupFolder({
    fileName,
    jsonText: `${JSON.stringify(payload, null, 2)}\n`,
  });

  const totalRows = TABLES.reduce((sum, table) => sum + counts[table], 0);
  return {
    fileName: uploaded.name,
    uploadedName: uploaded.name,
    createdAt,
    counts,
    totalRows,
  };
}
