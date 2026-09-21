export function chantierNeedsOnedriveFolder(
  lien: string | null | undefined,
): boolean {
  return !String(lien ?? "").trim();
}

export function devisNeedsOnedriveArchive(
  fichier: string | null | undefined,
): boolean {
  return !String(fichier ?? "").trim();
}

function runCatchUpFilterSelfCheck() {
  if (
    !chantierNeedsOnedriveFolder(null) ||
    !chantierNeedsOnedriveFolder("") ||
    !chantierNeedsOnedriveFolder("   ") ||
    chantierNeedsOnedriveFolder("https://onedrive.live.com/redir?resid=x")
  ) {
    throw new Error("catch-up-filter: lien chantier vide vs présent");
  }
  if (
    !devisNeedsOnedriveArchive(null) ||
    devisNeedsOnedriveArchive("Devis 12.pdf")
  ) {
    throw new Error("catch-up-filter: fichier devis vide vs présent");
  }
}
runCatchUpFilterSelfCheck();
