import "server-only";
import { getOnedriveConfig } from "@/lib/onedrive/config";
import { sanitizeOnedriveName } from "@/lib/onedrive/sanitize";
import {
  getValidAccessToken,
  loadOnedriveTokens,
  saveOnedriveRoot,
  saveOnedriveTokens,
} from "@/lib/onedrive/tokens";

type GraphErrorBody = {
  error?: { message?: string; code?: string };
};

async function graphFetch<T>(
  token: string,
  path: string,
  init?: RequestInit,
): Promise<T> {
  const res = await fetch(`https://graph.microsoft.com/v1.0${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(init?.body instanceof Buffer || init?.body instanceof Uint8Array
        ? {}
        : typeof init?.body === "string"
          ? { "Content-Type": "application/json" }
          : {}),
      ...(init?.headers ?? {}),
    },
  });
  if (res.status === 204) return undefined as T;
  const json = (await res.json().catch(() => ({}))) as T & GraphErrorBody;
  if (!res.ok) {
    throw new Error(
      json.error?.message || `Erreur Microsoft Graph (${res.status}).`,
    );
  }
  return json;
}

export function encodeSharingUrl(url: string): string {
  const b64 = Buffer.from(url, "utf8").toString("base64");
  const urlSafe = b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  return `u!${urlSafe}`;
}

type DriveItem = {
  id: string;
  name?: string;
  webUrl?: string;
  parentReference?: { driveId?: string };
};

async function resolveShareItem(
  token: string,
  shareUrl: string,
): Promise<{ itemId: string; driveId: string; webUrl?: string }> {
  const item = await graphFetch<DriveItem>(
    token,
    `/shares/${encodeSharingUrl(shareUrl)}/driveItem?$select=id,name,webUrl,parentReference`,
  );
  const driveId = item.parentReference?.driveId;
  if (!item.id || !driveId) {
    throw new Error("Impossible de résoudre le dossier OneDrive partagé.");
  }
  return { itemId: item.id, driveId, webUrl: item.webUrl };
}

export async function fetchOnedriveAccountLabel(token: string): Promise<string | null> {
  try {
    const me = await graphFetch<{ displayName?: string; userPrincipalName?: string; mail?: string }>(
      token,
      "/me?$select=displayName,userPrincipalName,mail",
    );
    return me.mail || me.userPrincipalName || me.displayName || null;
  } catch {
    return null;
  }
}

export async function persistAccountLabel(): Promise<void> {
  const token = await getValidAccessToken();
  const label = await fetchOnedriveAccountLabel(token);
  const row = await loadOnedriveTokens();
  if (!row || !label) return;
  await saveOnedriveTokens({
    access_token: row.access_token,
    refresh_token: row.refresh_token,
    expires_at: row.expires_at,
    account_label: label,
    root_item_id: row.root_item_id,
    root_drive_id: row.root_drive_id,
  });
}

export async function getRootFolder(): Promise<{ itemId: string; driveId: string }> {
  const token = await getValidAccessToken();
  const row = await loadOnedriveTokens();
  if (row?.root_item_id && row.root_drive_id) {
    try {
      await graphFetch(
        token,
        `/drives/${row.root_drive_id}/items/${row.root_item_id}?$select=id`,
      );
      return { itemId: row.root_item_id, driveId: row.root_drive_id };
    } catch {
      // Dossier déplacé ou lien périmé : on re-résout une fois.
    }
  }
  const cfg = getOnedriveConfig();
  const resolved = await resolveShareItem(token, cfg.rootShareUrl);
  await saveOnedriveRoot({
    root_item_id: resolved.itemId,
    root_drive_id: resolved.driveId,
  });
  return { itemId: resolved.itemId, driveId: resolved.driveId };
}

async function createShareLink(
  token: string,
  driveId: string,
  itemId: string,
): Promise<string | null> {
  try {
    const created = await graphFetch<{ link?: { webUrl?: string } }>(
      token,
      `/drives/${driveId}/items/${itemId}/createLink`,
      {
        method: "POST",
        body: JSON.stringify({ type: "view", scope: "anonymous" }),
      },
    );
    return created.link?.webUrl ?? null;
  } catch {
    return null;
  }
}

export async function createClientFolder(nomClient: string): Promise<string> {
  const token = await getValidAccessToken();
  const root = await getRootFolder();
  const name = sanitizeOnedriveName(nomClient, "Client");
  const item = await graphFetch<DriveItem>(
    token,
    `/drives/${root.driveId}/items/${root.itemId}/children`,
    {
      method: "POST",
      body: JSON.stringify({
        name,
        folder: {},
        "@microsoft.graph.conflictBehavior": "rename",
      }),
    },
  );
  const link =
    (await createShareLink(token, root.driveId, item.id)) || item.webUrl;
  if (!link) {
    throw new Error("Dossier créé mais aucun lien de partage n’a été renvoyé.");
  }
  return link;
}

export async function ensureChildFolder(name: string): Promise<{
  itemId: string;
  driveId: string;
}> {
  const token = await getValidAccessToken();
  const root = await getRootFolder();
  const encoded = encodeURIComponent(name);
  try {
    const existing = await graphFetch<DriveItem>(
      token,
      `/drives/${root.driveId}/items/${root.itemId}:/${encoded}`,
    );
    return {
      itemId: existing.id,
      driveId: existing.parentReference?.driveId || root.driveId,
    };
  } catch {
    try {
      const created = await graphFetch<DriveItem>(
        token,
        `/drives/${root.driveId}/items/${root.itemId}/children`,
        {
          method: "POST",
          body: JSON.stringify({
            name,
            folder: {},
            "@microsoft.graph.conflictBehavior": "fail",
          }),
        },
      );
      return {
        itemId: created.id,
        driveId: created.parentReference?.driveId || root.driveId,
      };
    } catch {
      const existing = await graphFetch<DriveItem>(
        token,
        `/drives/${root.driveId}/items/${root.itemId}:/${encoded}`,
      );
      return {
        itemId: existing.id,
        driveId: existing.parentReference?.driveId || root.driveId,
      };
    }
  }
}

export async function getBackupFolder(): Promise<{
  itemId: string;
  driveId: string;
}> {
  const token = await getValidAccessToken();
  const root = await getRootFolder();
  for (const name of ["Sauvegarde", "Sauvegardes"]) {
    try {
      const existing = await graphFetch<DriveItem>(
        token,
        `/drives/${root.driveId}/items/${root.itemId}:/${encodeURIComponent(name)}`,
      );
      return {
        itemId: existing.id,
        driveId: existing.parentReference?.driveId || root.driveId,
      };
    } catch {
      // dossier pas encore créé
    }
  }
  return ensureChildFolder("Sauvegarde");
}

export type BackupFileMeta = {
  id: string;
  name: string;
  createdAt: string;
  lastModifiedAt: string;
  size: number;
  webUrl?: string;
};

export async function listBackupFiles(): Promise<BackupFileMeta[]> {
  const token = await getValidAccessToken();
  const folder = await getBackupFolder();
  const page = await graphFetch<{
    value?: Array<{
      id: string;
      name?: string;
      size?: number;
      file?: unknown;
      folder?: unknown;
      createdDateTime?: string;
      lastModifiedDateTime?: string;
      webUrl?: string;
    }>;
  }>(
    token,
    `/drives/${folder.driveId}/items/${folder.itemId}/children?$select=id,name,size,file,folder,createdDateTime,lastModifiedDateTime,webUrl&$top=200`,
  );
  return (page.value ?? [])
    .filter(
      (item) =>
        item.file &&
        !item.folder &&
        (item.name ?? "").toLowerCase().endsWith(".json"),
    )
    .map((item) => ({
      id: item.id,
      name: item.name ?? "sauvegarde.json",
      createdAt: item.createdDateTime ?? item.lastModifiedDateTime ?? "",
      lastModifiedAt: item.lastModifiedDateTime ?? item.createdDateTime ?? "",
      size: item.size ?? 0,
      webUrl: item.webUrl,
    }))
    .sort((a, b) => (a.lastModifiedAt < b.lastModifiedAt ? 1 : -1));
}

export async function downloadBackupJson(itemId: string): Promise<string> {
  const token = await getValidAccessToken();
  const folder = await getBackupFolder();
  const meta = await graphFetch<
    DriveItem & { parentReference?: { id?: string; driveId?: string } }
  >(
    token,
    `/drives/${folder.driveId}/items/${encodeURIComponent(itemId)}?$select=id,name,parentReference`,
  );
  const parentId = meta.parentReference?.id;
  if (!parentId || parentId !== folder.itemId) {
    throw new Error("Ce fichier n’est pas une sauvegarde du dossier Sauvegarde.");
  }
  const res = await fetch(
    `https://graph.microsoft.com/v1.0/drives/${folder.driveId}/items/${encodeURIComponent(itemId)}/content`,
    {
      headers: { Authorization: `Bearer ${token}` },
      redirect: "follow",
    },
  );
  if (!res.ok) {
    throw new Error(`Impossible de lire la sauvegarde (${res.status}).`);
  }
  return res.text();
}

export async function uploadJsonToBackupFolder(input: {
  fileName: string;
  jsonText: string;
  failIfExists?: boolean;
}): Promise<{ name: string; webUrl?: string }> {
  const token = await getValidAccessToken();
  const folder = await getBackupFolder();
  const safeName = sanitizeOnedriveName(input.fileName, "sauvegarde-planning.json");
  const encodedName = encodeURIComponent(safeName);
  const res = await fetch(
    `https://graph.microsoft.com/v1.0/drives/${folder.driveId}/items/${folder.itemId}:/${encodedName}:/content`,
    {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json; charset=utf-8",
        Prefer: input.failIfExists
          ? "conflictBehavior=fail"
          : "conflictBehavior=rename",
      },
      body: new TextEncoder().encode(input.jsonText),
    },
  );
  const json = (await res.json().catch(() => ({}))) as DriveItem & GraphErrorBody;
  if (!res.ok) {
    const message =
      json.error?.message || `Envoi de la sauvegarde OneDrive impossible (${res.status}).`;
    if (
      input.failIfExists &&
      (res.status === 409 ||
        json.error?.code === "nameAlreadyExists" ||
        /already exists|nameAlreadyExists/i.test(message))
    ) {
      throw new Error("BACKUP_ALREADY_EXISTS");
    }
    throw new Error(message);
  }
  return { name: json.name || safeName, webUrl: json.webUrl };
}

export async function uploadPngToShareFolder(input: {
  shareUrl: string;
  fileName: string;
  pngBytes: Buffer;
}): Promise<void> {
  const token = await getValidAccessToken();
  const folder = await resolveShareItem(token, input.shareUrl);
  const safeName = sanitizeOnedriveName(input.fileName, "reception.png");
  const encodedName = encodeURIComponent(safeName);
  const res = await fetch(
    `https://graph.microsoft.com/v1.0/drives/${folder.driveId}/items/${folder.itemId}:/${encodedName}:/content`,
    {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "image/png",
      },
      body: new Uint8Array(input.pngBytes),
    },
  );
  if (!res.ok) {
    const json = (await res.json().catch(() => ({}))) as GraphErrorBody;
    throw new Error(
      json.error?.message || `Envoi du fichier OneDrive impossible (${res.status}).`,
    );
  }
}
