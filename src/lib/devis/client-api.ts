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
  if (isTransientHttpStatus(response.status)) return DATABASE_UNAVAILABLE_MESSAGE;
  try {
    const data = (await response.json()) as { error?: string };
    if (typeof data.error === "string" && data.error.trim()) return data.error;
  } catch {
    // ignore
  }
  return DATABASE_UNAVAILABLE_MESSAGE;
}

function throwIfAuthRedirect(status: number) {
  if (status === 401) {
    window.location.href = "/connexion";
    throw new Error("Non authentifié.");
  }
}

export async function devisApi<T>(
  url: string,
  init?: RequestInit & { attempts?: number },
): Promise<T> {
  const attempts = init?.attempts;
  const rest: RequestInit = { ...init };
  delete (rest as { attempts?: number }).attempts;
  return withTransientRetry(
    async () => {
      const response = await fetch(url, {
        cache: "no-store",
        ...rest,
      });
      throwIfAuthRedirect(response.status);
      let data: T & { error?: string };
      try {
        data = (await response.json()) as T & { error?: string };
      } catch {
        throw new Error(await parseError(response));
      }
      if (!response.ok) {
        throw new Error(
          (typeof data.error === "string" && data.error.trim()) ||
            (await parseError(response)),
        );
      }
      return data;
    },
    {
      attempts:
        attempts ??
        (rest.method && rest.method !== "GET"
          ? TRANSIENT_WRITE_ATTEMPTS
          : TRANSIENT_READ_ATTEMPTS),
    },
  );
}
