function getSupabaseUrl(): string | undefined {
  const value = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  return value || undefined;
}

function getPublishableKey(): string | undefined {
  const value = (
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  )?.trim();
  return value || undefined;
}

/** Présence de l’URL publique : le navigateur n’appelle jamais Supabase directement. */
export function isSupabaseConfigured(): boolean {
  return Boolean(getSupabaseUrl() && getPublishableKey());
}
