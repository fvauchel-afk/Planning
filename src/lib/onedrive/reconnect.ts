/** Erreurs Microsoft qui imposent de reconnecter OneDrive (jeton périmé, MSA, JWT). */
export function needsOnedriveReconnect(message: string | undefined): boolean {
  return /expirée|invalid_grant|AADSTS|refusé l.accès au OneDrive personnel|IDX14100|UnauthenticatedVroom|JWT is not well formed|InvalidAuthenticationToken|accessDenied|access denied|acc[eè]s refus[eé]|Erreur Microsoft Graph \(40[13]\)/i.test(
    message ?? "",
  );
}

/** Marge avant expiration de l’access token pour un rafraîchissement au login. */
export const ONEDRIVE_KEEPALIVE_TTL_MS = 10 * 60 * 1000;

export const ONEDRIVE_REFRESH_RETRY_MAX = 2;

export function onedriveAccessNeedsRefresh(
  expiresAt: string | null | undefined,
  nowMs: number,
  minTtlMs: number,
): boolean {
  if (!expiresAt) return true;
  const expires = new Date(expiresAt).getTime();
  if (!Number.isFinite(expires)) return true;
  return expires - minTtlMs <= nowMs;
}

/**
 * Microsoft invalide l’ancien refresh token dès qu’un autre appel en a obtenu
 * un nouveau. Un second rafraîchissement concurrent (login + keepalive + statut)
 * reçoit alors invalid_grant alors que la ligne en base est déjà à jour.
 */
export function shouldRetryOnedriveRefresh(input: {
  attempt: number;
  errorMessage: string;
  previousRefreshToken: string;
  currentRefreshToken: string | null | undefined;
  currentExpiresAt: string | null | undefined;
  nowMs: number;
  minTtlMs: number;
}): boolean {
  if (input.attempt >= ONEDRIVE_REFRESH_RETRY_MAX) return false;
  if (!needsOnedriveReconnect(input.errorMessage)) return false;
  if (!input.currentRefreshToken) return false;
  if (input.currentRefreshToken !== input.previousRefreshToken) return true;
  return !onedriveAccessNeedsRefresh(
    input.currentExpiresAt,
    input.nowMs,
    input.minTtlMs,
  );
}

function runOnedriveReconnectSelfCheck() {
  if (
    !needsOnedriveReconnect(
      "Microsoft a refusé l’accès au OneDrive personnel. Réessayez.",
    )
  ) {
    throw new Error("onedrive: refus personnel doit demander une reconnexion");
  }
  if (!needsOnedriveReconnect("Connexion OneDrive expirée. Ouvrez l’onglet OneDrive.")) {
    throw new Error("onedrive: jeton expiré doit demander une reconnexion");
  }
  if (needsOnedriveReconnect("Dossier introuvable.")) {
    throw new Error("onedrive: erreur métier ne doit pas masquer une connexion OK");
  }
  if (!needsOnedriveReconnect("Access denied")) {
    throw new Error("onedrive: Access denied Microsoft doit demander une reconnexion");
  }
  if (!needsOnedriveReconnect("Erreur Microsoft Graph (403).")) {
    throw new Error("onedrive: Graph 403 doit demander une reconnexion");
  }
  const now = Date.parse("2026-09-14T12:00:00.000Z");
  if (
    !onedriveAccessNeedsRefresh(
      "2026-09-14T12:05:00.000Z",
      now,
      ONEDRIVE_KEEPALIVE_TTL_MS,
    )
  ) {
    throw new Error("onedrive: access token bientôt expiré doit être rafraîchi");
  }
  if (
    onedriveAccessNeedsRefresh(
      "2026-09-14T13:00:00.000Z",
      now,
      ONEDRIVE_KEEPALIVE_TTL_MS,
    )
  ) {
    throw new Error("onedrive: access token encore valide ne doit pas être rafraîchi");
  }
  if (
    !onedriveAccessNeedsRefresh(
      "2026-09-14T11:00:00.000Z",
      now,
      ONEDRIVE_KEEPALIVE_TTL_MS,
    )
  ) {
    throw new Error("onedrive: access token déjà expiré doit être rafraîchi");
  }
  const grant = "Connexion OneDrive expirée. Ouvrez l’onglet OneDrive.";
  if (
    !shouldRetryOnedriveRefresh({
      attempt: 0,
      errorMessage: grant,
      previousRefreshToken: "R1",
      currentRefreshToken: "R2",
      currentExpiresAt: "2026-09-14T13:00:00.000Z",
      nowMs: now,
      minTtlMs: ONEDRIVE_KEEPALIVE_TTL_MS,
    })
  ) {
    throw new Error("onedrive: invalid_grant après rotation concurrente doit retenter");
  }
  if (
    shouldRetryOnedriveRefresh({
      attempt: 0,
      errorMessage: grant,
      previousRefreshToken: "R1",
      currentRefreshToken: "R1",
      currentExpiresAt: "2026-09-14T11:00:00.000Z",
      nowMs: now,
      minTtlMs: ONEDRIVE_KEEPALIVE_TTL_MS,
    })
  ) {
    throw new Error("onedrive: invalid_grant sans nouveau jeton ne doit pas boucler");
  }
  if (
    !shouldRetryOnedriveRefresh({
      attempt: 0,
      errorMessage: grant,
      previousRefreshToken: "R1",
      currentRefreshToken: "R1",
      currentExpiresAt: "2026-09-14T13:00:00.000Z",
      nowMs: now,
      minTtlMs: ONEDRIVE_KEEPALIVE_TTL_MS,
    })
  ) {
    throw new Error("onedrive: un autre worker a déjà rafraîchi l’access token");
  }
  if (
    shouldRetryOnedriveRefresh({
      attempt: ONEDRIVE_REFRESH_RETRY_MAX,
      errorMessage: grant,
      previousRefreshToken: "R1",
      currentRefreshToken: "R2",
      currentExpiresAt: "2026-09-14T13:00:00.000Z",
      nowMs: now,
      minTtlMs: ONEDRIVE_KEEPALIVE_TTL_MS,
    })
  ) {
    throw new Error("onedrive: trop de tentatives de rafraîchissement");
  }
}

runOnedriveReconnectSelfCheck();
