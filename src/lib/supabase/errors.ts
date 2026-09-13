export function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "object" && err && "message" in err) {
    return String((err as { message: unknown }).message);
  }
  return "Erreur inconnue";
}

export type SupabaseErrorInfo = {
  code: string;
  message: string;
  details: string;
  hint: string;
};

export function supabaseErrorInfo(err: unknown): SupabaseErrorInfo {
  const obj = err && typeof err === "object" ? (err as Record<string, unknown>) : {};
  return {
    code: obj.code != null ? String(obj.code) : "",
    message: errorMessage(err),
    details: obj.details != null ? String(obj.details) : "",
    hint: obj.hint != null ? String(obj.hint) : "",
  };
}

export function formatSupabaseErrorDetail(err: unknown): string {
  const info = supabaseErrorInfo(err);
  return [info.code && `code ${info.code}`, info.message, info.details, info.hint]
    .filter(Boolean)
    .join(" — ");
}

export function logSupabaseError(context: string, err: unknown) {
  console.error(`[supabase] ${context}`, supabaseErrorInfo(err));
}

export function isMissingSchemaError(err: unknown): boolean {
  if (err == null) return false;
  const message = errorMessage(err);
  const code =
    typeof err === "object" && err && "code" in err
      ? String((err as { code: unknown }).code)
      : "";
  return (
    code === "PGRST205" ||
    message.includes("schema cache") ||
    message.includes("Could not find the table") ||
    message.includes("Tables Supabase introuvables")
  );
}

export function formatSaveError(
  err: unknown,
  action = "l’enregistrement a échoué",
): string {
  const reason =
    err instanceof Error && err.message.trim()
      ? err.message.trim()
      : "erreur inconnue";
  return `Une erreur est survenue, ${action} : ${reason}`;
}

export const DATABASE_UNAVAILABLE_MESSAGE =
  "Impossible de se connecter à la base de données, réessayez plus tard.";

export const SCHEMA_HELP =
  "Tables Supabase introuvables. Exécutez les scripts SQL du dossier supabase/migrations dans le SQL Editor du projet.";

function looksLikeConnectivityError(err: unknown): boolean {
  const message = `${errorMessage(err)} ${formatSupabaseErrorDetail(err)}`;
  return /gateway timeout|504|503|502|chargement trop long|failed to fetch|fetch failed|econnreset|etimedout|timeout|abort/i.test(
    message,
  );
}

export function isMissingColumnError(err: unknown, column: string): boolean {
  if (err == null) return false;
  const message = errorMessage(err);
  const code =
    typeof err === "object" && err && "code" in err
      ? String((err as { code: unknown }).code)
      : "";
  return (
    code === "PGRST204" ||
    (message.includes(column) &&
      (message.includes("schema cache") ||
        message.includes("Could not find") ||
        message.includes("column")))
  );
}
export function wrapSupabaseError(err: unknown): Error {
  logSupabaseError("wrap", err);
  if (looksLikeConnectivityError(err)) {
    return new Error(DATABASE_UNAVAILABLE_MESSAGE);
  }
  const detail = formatSupabaseErrorDetail(err);
  if (isMissingSchemaError(err)) {
    return new Error(`${SCHEMA_HELP} Détail technique : ${detail}`);
  }
  return err instanceof Error && !detail.includes(err.message)
    ? err
    : new Error(detail || errorMessage(err));
}

export function asIsoDate(value: string | null | undefined): string | null {
  if (!value) return null;
  return value.slice(0, 10);
}
