import {
  DATABASE_UNAVAILABLE_MESSAGE,
} from "@/lib/supabase/errors";
import {
  isTransientHttpStatus,
  TRANSIENT_READ_ATTEMPTS,
  TRANSIENT_WRITE_ATTEMPTS,
  withTransientRetry,
} from "@/lib/supabase/retry";

async function parseError(response: Response): Promise<string> {
  if (response.status === 401) return "Non authentifié.";
  if (response.status === 403) return "Accès refusé.";
  if (isTransientHttpStatus(response.status)) {
    return DATABASE_UNAVAILABLE_MESSAGE;
  }
  try {
    const data = (await response.json()) as { error?: string };
    if (typeof data.error === "string" && data.error.trim()) return data.error;
  } catch {
    // Corps non JSON (page d’erreur Vercel, etc.)
  }
  return DATABASE_UNAVAILABLE_MESSAGE;
}

function throwIfAuthRedirect(status: number) {
  if (status === 401) {
    window.location.href = "/connexion";
    throw new Error("Non authentifié.");
  }
}

export async function fetchPlanningSnapshot(): Promise<{
  usingSupabase: boolean;
  snapshot: unknown | null;
}> {
  return withTransientRetry(
    async () => {
      const response = await fetch("/api/planning/snapshot", { cache: "no-store" });
      throwIfAuthRedirect(response.status);
      let data: {
        error?: string;
        usingSupabase?: boolean;
        snapshot?: unknown;
      } = {};
      try {
        data = (await response.json()) as typeof data;
      } catch {
        throw new Error(
          !response.ok ? await parseError(response) : DATABASE_UNAVAILABLE_MESSAGE,
        );
      }
      if (!response.ok) {
        throw new Error(
          (typeof data.error === "string" && data.error.trim()) ||
            DATABASE_UNAVAILABLE_MESSAGE,
        );
      }
      return {
        usingSupabase: Boolean(data.usingSupabase),
        snapshot: data.snapshot ?? null,
      };
    },
    { attempts: TRANSIENT_READ_ATTEMPTS },
  );
}

export async function planningMutate<T = { ok: boolean; chantierId?: string }>(
  body: Record<string, unknown>,
): Promise<T> {
  return withTransientRetry(
    async () => {
      const response = await fetch("/api/planning/mutate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      throwIfAuthRedirect(response.status);
      let data: T & { error?: string };
      try {
        data = (await response.json()) as T & { error?: string };
      } catch {
        throw new Error(
          isTransientHttpStatus(response.status)
            ? DATABASE_UNAVAILABLE_MESSAGE
            : "Erreur serveur.",
        );
      }
      if (!response.ok) {
        throw new Error(
          (typeof data.error === "string" && data.error.trim()) ||
            (isTransientHttpStatus(response.status)
              ? DATABASE_UNAVAILABLE_MESSAGE
              : "Erreur serveur."),
        );
      }
      return data;
    },
    { attempts: TRANSIENT_WRITE_ATTEMPTS },
  );
}

export async function planningApiPost<T>(
  url: string,
  body: Record<string, unknown>,
  options?: { attempts?: number },
): Promise<T> {
  return withTransientRetry(
    async () => {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      throwIfAuthRedirect(response.status);
      let data: T & { error?: string };
      try {
        data = (await response.json()) as T & { error?: string };
      } catch {
        throw new Error(
          isTransientHttpStatus(response.status)
            ? DATABASE_UNAVAILABLE_MESSAGE
            : "Erreur serveur.",
        );
      }
      if (!response.ok) {
        throw new Error(
          (typeof data.error === "string" && data.error.trim()) ||
            (isTransientHttpStatus(response.status)
              ? DATABASE_UNAVAILABLE_MESSAGE
              : "Erreur serveur."),
        );
      }
      return data;
    },
    { attempts: options?.attempts ?? TRANSIENT_WRITE_ATTEMPTS },
  );
}
