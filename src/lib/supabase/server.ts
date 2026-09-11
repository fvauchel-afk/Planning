import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

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

function getServiceRoleKey(): string | undefined {
  const value = (
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SECRET_KEY ||
    process.env.SUPABASE_SERVICE_KEY
  )?.trim();
  return value || undefined;
}

function jwtRole(token: string): string | null {
  const parts = token.split(".");
  if (parts.length < 2) return null;
  try {
    const json = Buffer.from(
      parts[1]!.replace(/-/g, "+").replace(/_/g, "/"),
      "base64",
    ).toString("utf8");
    const payload = JSON.parse(json) as { role?: unknown };
    return typeof payload.role === "string" ? payload.role : null;
  } catch {
    return null;
  }
}

function assertServiceRoleKey(key: string, publishable: string | undefined) {
  if (publishable && key === publishable) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY est identique à la clé publique (anon/publishable). Copiez la clé service_role (secret) du dashboard Supabase, pas la clé publishable.",
    );
  }
  if (key.startsWith("sb_publishable_")) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY contient une clé publishable. Il faut la clé secret / service_role.",
    );
  }
  if (key.startsWith("eyJ")) {
    const role = jwtRole(key);
    if (role && role !== "service_role") {
      throw new Error(
        `SUPABASE_SERVICE_ROLE_KEY n’est pas une clé service_role (rôle JWT : ${role}). Dans Supabase → Project Settings → API, copiez la clé service_role, pas anon.`,
      );
    }
  }
}

function createAnonClientWithKey(url: string, key: string): SupabaseClient {
  return createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    global: {
      fetch: (input, init) => {
        const headers = new Headers(init?.headers);
        if (!headers.has("apikey")) headers.set("apikey", key);
        const authorization = headers.get("Authorization");
        if (
          key.startsWith("sb_publishable_") &&
          authorization?.toLowerCase().startsWith("bearer sb_")
        ) {
          headers.delete("Authorization");
        }
        return fetch(input, { ...init, headers });
      },
    },
  });
}

function createServiceClientWithKey(url: string, key: string): SupabaseClient {
  return createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    global: {
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
      },
      fetch: (input, init) => {
        const headers = new Headers(init?.headers);
        headers.set("apikey", key);
        headers.set("Authorization", `Bearer ${key}`);
        return fetch(input, { ...init, headers });
      },
    },
  });
}

const SERVICE_ROLE_MISSING =
  "Clé SUPABASE_SERVICE_ROLE_KEY (ou SUPABASE_SECRET_KEY) absente côté serveur. Sans elle, les pages ne peuvent pas lire ni écrire le planning une fois les accès Supabase fermés.";

export function isSupabaseUrlConfigured(): boolean {
  return Boolean(getSupabaseUrl() && getPublishableKey());
}

export function isSupabaseServerConfigured(): boolean {
  return isSupabaseUrlConfigured();
}

export function hasSupabaseServiceRole(): boolean {
  return Boolean(getSupabaseUrl() && getServiceRoleKey());
}

/** Clé anon : uniquement pour login_with_pin si la clé service_role n’est pas là. */
export function createSupabaseAnonClient(): SupabaseClient {
  const url = getSupabaseUrl();
  const key = getPublishableKey();
  if (!url || !key) {
    throw new Error("Supabase n'est pas configuré.");
  }
  return createAnonClientWithKey(url, key);
}

/** Lectures / écritures tables : clé service_role uniquement, jamais l’anon. */
export function createSupabaseServerClient(): SupabaseClient {
  const url = getSupabaseUrl();
  const service = getServiceRoleKey();
  if (!url || !service) {
    throw new Error(SERVICE_ROLE_MISSING);
  }
  assertServiceRoleKey(service, getPublishableKey());
  return createServiceClientWithKey(url, service);
}
