import {
  DATABASE_UNAVAILABLE_MESSAGE,
} from "@/lib/supabase/errors";

async function parseError(response: Response): Promise<string> {
  if (response.status === 401) return "Non authentifié.";
  if (response.status === 403) return "Accès refusé.";
  if (response.status === 502 || response.status === 503 || response.status === 504) {
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

export async function fetchPlanningSnapshot(): Promise<{
  usingSupabase: boolean;
  snapshot: unknown | null;
}> {
  const response = await fetch("/api/planning/snapshot", { cache: "no-store" });
  if (response.status === 401) {
    window.location.href = "/connexion";
    throw new Error("Non authentifié.");
  }
  let data: {
    error?: string;
    usingSupabase?: boolean;
    snapshot?: unknown;
  } = {};
  try {
    data = (await response.json()) as typeof data;
  } catch {
    if (!response.ok) throw new Error(await parseError(response));
    throw new Error(DATABASE_UNAVAILABLE_MESSAGE);
  }
  if (!response.ok) {
    throw new Error(
      (typeof data.error === "string" && data.error.trim()) ||
        (await parseError(response)),
    );
  }
  return {
    usingSupabase: Boolean(data.usingSupabase),
    snapshot: data.snapshot ?? null,
  };
}

export async function planningMutate<T = { ok: boolean; chantierId?: string }>(
  body: Record<string, unknown>,
): Promise<T> {
  const response = await fetch("/api/planning/mutate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (response.status === 401) {
    window.location.href = "/connexion";
    throw new Error("Non authentifié.");
  }
  let data: T & { error?: string };
  try {
    data = (await response.json()) as T & { error?: string };
  } catch {
    throw new Error(
      response.status === 502 || response.status === 503 || response.status === 504
        ? DATABASE_UNAVAILABLE_MESSAGE
        : "Erreur serveur.",
    );
  }
  if (!response.ok) {
    throw new Error(
      (typeof data.error === "string" && data.error.trim()) || "Erreur serveur.",
    );
  }
  return data;
}
