import {
  DATABASE_UNAVAILABLE_MESSAGE,
  errorMessage,
  isConnectivityError,
} from "@/lib/supabase/errors";

export const TRANSIENT_READ_ATTEMPTS = 3;
export const TRANSIENT_WRITE_ATTEMPTS = 2;
export const TRANSIENT_RETRY_DELAY_MS = 400;

export function isTransientHttpStatus(status: number): boolean {
  return (
    status === 408 ||
    status === 425 ||
    status === 429 ||
    status === 502 ||
    status === 503 ||
    status === 504
  );
}

export function isRetryableFetchError(err: unknown): boolean {
  if (err == null) return false;
  const name =
    typeof err === "object" && err && "name" in err
      ? String((err as { name: unknown }).name)
      : "";
  if (name === "TimeoutError") return true;
  if (name === "AbortError") return true;
  return isConnectivityError(err);
}

export function isRetryableUserFacingError(err: unknown): boolean {
  const message = errorMessage(err);
  if (message === "Non authentifié." || message === "Accès refusé.") {
    return false;
  }
  return message === DATABASE_UNAVAILABLE_MESSAGE || isConnectivityError(err);
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export async function withTransientRetry<T>(
  fn: (attempt: number) => Promise<T>,
  options?: {
    attempts?: number;
    delayMs?: number;
    retryIf?: (err: unknown) => boolean;
  },
): Promise<T> {
  const attempts = Math.max(1, options?.attempts ?? TRANSIENT_READ_ATTEMPTS);
  const delayMs = options?.delayMs ?? TRANSIENT_RETRY_DELAY_MS;
  const retryIf = options?.retryIf ?? isRetryableUserFacingError;
  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await fn(attempt);
    } catch (err) {
      lastError = err;
      if (attempt >= attempts || !retryIf(err)) throw err;
      await sleep(delayMs * attempt);
    }
  }
  throw lastError;
}

function runRetrySelfCheck() {
  if (!isTransientHttpStatus(503) || isTransientHttpStatus(401)) {
    throw new Error("retry: statuts HTTP transitoires");
  }
  if (!isRetryableUserFacingError(new Error(DATABASE_UNAVAILABLE_MESSAGE))) {
    throw new Error("retry: message base indisponible");
  }
  if (isRetryableUserFacingError(new Error("Non authentifié."))) {
    throw new Error("retry: ne pas relancer une 401");
  }
  if (isRetryableFetchError(new Error("fetch failed")) !== true) {
    throw new Error("retry: fetch failed doit être relancé");
  }
}

runRetrySelfCheck();
