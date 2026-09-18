/** Extrait un identifiant d’élément OneDrive personnel depuis un lien de dossier. */
export function parseOnedriveItemIdFromUrl(raw: string): string | null {
  const value = raw.trim();
  if (!value) return null;
  let url: URL;
  try {
    url = new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`);
  } catch {
    return null;
  }
  const keys = ["resid", "resourceid", "id"] as const;
  for (const key of keys) {
    const param = url.searchParams.get(key);
    if (!param) continue;
    const decoded = decodeURIComponent(param.replace(/\+/g, " ")).trim();
    if (decoded.includes("!")) return decoded;
  }
  return null;
}

export function onedriveFolderNamesEqual(a: string, b: string): boolean {
  const left = a.replace(/\s+/g, " ").trim().toLocaleLowerCase("fr");
  const right = b.replace(/\s+/g, " ").trim().toLocaleLowerCase("fr");
  return Boolean(left) && left === right;
}

function runOnedriveShareUrlSelfCheck() {
  const resid = parseOnedriveItemIdFromUrl(
    "https://onedrive.live.com/redir?resid=75FD296B1CB875EB!123&authkey=!abc",
  );
  if (resid !== "75FD296B1CB875EB!123") {
    throw new Error(`onedrive-share-url: resid, reçu ${resid}`);
  }
  const id = parseOnedriveItemIdFromUrl(
    "https://onedrive.live.com/?cid=75FD296B1CB875EB&id=75FD296B1CB875EB%21123",
  );
  if (id !== "75FD296B1CB875EB!123") {
    throw new Error(`onedrive-share-url: id, reçu ${id}`);
  }
  if (parseOnedriveItemIdFromUrl("https://1drv.ms/f/c/abc/def") !== null) {
    throw new Error("onedrive-share-url: court lien 1drv sans id");
  }
  if (!onedriveFolderNamesEqual("Blaevoet Baie", "blaevoet  baie")) {
    throw new Error("onedrive-share-url: noms de dossier équivalents");
  }
}

runOnedriveShareUrlSelfCheck();
