/** Erreurs Microsoft qui imposent de reconnecter OneDrive (jeton périmé, MSA, JWT). */
export function needsOnedriveReconnect(message: string | undefined): boolean {
  return /expirée|invalid_grant|AADSTS|refusé l.accès au OneDrive personnel|IDX14100|UnauthenticatedVroom|JWT is not well formed|InvalidAuthenticationToken|accessDenied|Erreur Microsoft Graph \(40[13]\)/i.test(
    message ?? "",
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
}

runOnedriveReconnectSelfCheck();
