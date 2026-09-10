export function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "object" && err && "message" in err) {
    return String((err as { message: unknown }).message);
  }
  return "Erreur inconnue";
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

export const SCHEMA_HELP =
  "Tables Supabase introuvables. Exécutez supabase/migrations/001_init.sql à 014_heure_debut.sql dans le SQL Editor du projet. En attendant, l’application enregistre en local.";

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
  if (isMissingSchemaError(err)) {
    return new Error(SCHEMA_HELP);
  }
  return err instanceof Error ? err : new Error(errorMessage(err));
}

export function asIsoDate(value: string | null | undefined): string | null {
  if (!value) return null;
  return value.slice(0, 10);
}
