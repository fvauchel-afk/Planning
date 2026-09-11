async function parseError(response: Response): Promise<string> {
  try {
    const data = (await response.json()) as { error?: string };
    if (data.error) return data.error;
  } catch {
    // ignore
  }
  if (response.status === 401) return "Non authentifié.";
  if (response.status === 403) return "Accès refusé.";
  return "Erreur serveur.";
}

export async function fetchPlanningSnapshot(): Promise<{
  usingSupabase: boolean;
  snapshot: unknown | null;
}> {
  const response = await fetch("/api/planning/snapshot");
  if (response.status === 401) {
    window.location.href = "/connexion";
    throw new Error("Non authentifié.");
  }
  const data = (await response.json()) as {
    error?: string;
    usingSupabase?: boolean;
    snapshot?: unknown;
  };
  if (!response.ok) throw new Error(data.error || (await parseError(response)));
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
  const data = (await response.json()) as T & { error?: string };
  if (!response.ok) throw new Error(data.error || "Erreur serveur.");
  return data;
}
