import "server-only";
import { isRetryableFetchError, isTransientHttpStatus, sleep } from "@/lib/supabase/retry";
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

function timedFetch(
  input: RequestInfo | URL,
  init: RequestInit | undefined,
  extraHeaders: Headers,
): Promise<Response> {
  const headers = extraHeaders;
  const timeout = AbortSignal.timeout(12_000);
  const signal = init?.signal
    ? abortWhenAny(init.signal, timeout)
    : timeout;
  return fetch(input, { ...init, headers, signal });
}

function abortWhenAny(left: AbortSignal, right: AbortSignal): AbortSignal {
  if (typeof AbortSignal.any === "function") {
    return AbortSignal.any([left, right]);
  }
  const controller = new AbortController();
  const onAbort = () => controller.abort();
  if (left.aborted || right.aborted) {
    controller.abort();
    return controller.signal;
  }
  left.addEventListener("abort", onAbort, { once: true });
  right.addEventListener("abort", onAbort, { once: true });
  return controller.signal;
}

async function fetchWithTransientRetry(
  input: RequestInfo | URL,
  init: RequestInit | undefined,
  extraHeaders: Headers,
): Promise<Response> {
  const method = (
    init?.method ||
    (input instanceof Request ? input.method : "GET")
  ).toUpperCase();
  const mutating = method !== "GET" && method !== "HEAD";
  const attempts = mutating ? 2 : 3;
  let lastError: unknown;
  let lastResponse: Response | undefined;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    if (init?.signal?.aborted) {
      throw lastError instanceof Error
        ? lastError
        : new Error("La requête a été interrompue.");
    }
    try {
      const response = await timedFetch(input, init, extraHeaders);
      if (!isTransientHttpStatus(response.status) || attempt === attempts) {
        return response;
      }
      lastResponse = response;
      try {
        await response.body?.cancel();
      } catch {
        // Corps déjà consommé ou indisponible.
      }
    } catch (err) {
      lastError = err;
      const callerAborted = Boolean(init?.signal?.aborted);
      if (callerAborted || !isRetryableFetchError(err) || attempt === attempts) {
        throw err;
      }
    }
    if (attempt < attempts) await sleep(300 * attempt);
  }
  if (lastResponse) return lastResponse;
  throw lastError instanceof Error
    ? lastError
    : new Error("Connexion à la base interrompue.");
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
        return fetchWithTransientRetry(input, init, headers);
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
        return fetchWithTransientRetry(input, init, headers);
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
