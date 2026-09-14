/**
 * Compte personnel : Graph valide /drives/{id} et /shares comme du SharePoint (JWT).
 * /me/drive accepte le jeton opaque Hotmail.
 */
export function toGraphMeDrivePath(path: string): string | null {
  const match = path.match(/^\/drives\/[^/]+\/items\/(.+)$/);
  if (!match) return null;
  return `/me/drive/items/${match[1]}`;
}

function runGraphMeDrivePathSelfCheck() {
  const children = toGraphMeDrivePath("/drives/abc/items/xyz/children");
  if (children !== "/me/drive/items/xyz/children") {
    throw new Error(`me-drive-path: children, reçu ${children}`);
  }
  const link = toGraphMeDrivePath("/drives/abc/items/xyz/createLink");
  if (link !== "/me/drive/items/xyz/createLink") {
    throw new Error(`me-drive-path: createLink, reçu ${link}`);
  }
  const content = toGraphMeDrivePath("/drives/abc/items/xyz:/file.json:/content");
  if (content !== "/me/drive/items/xyz:/file.json:/content") {
    throw new Error(`me-drive-path: content, reçu ${content}`);
  }
  if (toGraphMeDrivePath("/shares/u!foo/driveItem") !== null) {
    throw new Error("me-drive-path: /shares n’est pas /me/drive");
  }
  if (toGraphMeDrivePath("/me/sendMail") !== null) {
    throw new Error("me-drive-path: /me inchangé");
  }
}

runGraphMeDrivePathSelfCheck();
