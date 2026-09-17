/** Erreurs Microsoft qui imposent de reconnecter OneDrive (jeton périmé, MSA, JWT). */
export function needsOnedriveReconnect(message: string | undefined): boolean {
  return /expirée|invalid_grant|AADSTS|refusé l.accès au OneDrive personnel|IDX14100|UnauthenticatedVroom|JWT is not well formed|InvalidAuthenticationToken|accessDenied|access denied|acc[eè]s refus[eé]|Erreur Microsoft Graph \(40[13]\)/i.test(
    message ?? "",
  );
}

/** Marge avant expiration de l’access token pour un rafraîchissement au login. */
export const ONEDRIVE_KEEPALIVE_TTL_MS = 10 * 60 * 1000;

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
}

runOnedriveReconnectSelfCheck();
