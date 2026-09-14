/** Compte Hotmail / MSA : jeton opaque (pas un JWT). L’API OneDrive personnelle l’accepte. */
export function toPersonalOnedrivePath(path: string): string | null {
  if (path.startsWith("/shares/")) return path;
  const match = path.match(/^\/drives\/[^/]+\/items\/(.+)$/);
  if (!match) return null;
  const rest = match[1]!.replace(/\/createLink$/, "/action.createLink");
  return `/drive/items/${rest}`;
}

function runOnedrivePathSelfCheck() {
  const children = toPersonalOnedrivePath("/drives/abc/items/xyz/children");
  if (children !== "/drive/items/xyz/children") {
    throw new Error(`onedrive-path: children, reçu ${children}`);
  }
  const share = toPersonalOnedrivePath("/shares/u!foo/driveItem");
  if (share !== "/shares/u!foo/driveItem") {
    throw new Error(`onedrive-path: shares, reçu ${share}`);
  }
  const link = toPersonalOnedrivePath("/drives/abc/items/xyz/createLink");
  if (link !== "/drive/items/xyz/action.createLink") {
    throw new Error(`onedrive-path: createLink, reçu ${link}`);
  }
  if (toPersonalOnedrivePath("/me/sendMail") !== null) {
    throw new Error("onedrive-path: /me reste sur Graph");
  }
}

runOnedrivePathSelfCheck();
