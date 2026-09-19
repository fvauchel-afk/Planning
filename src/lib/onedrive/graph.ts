import "server-only";
import { getOnedriveConfig } from "@/lib/onedrive/config";
import { sanitizeOnedriveName } from "@/lib/onedrive/sanitize";
import { toGraphMeDrivePath } from "@/lib/onedrive/personal-path";
import {
  onedriveFolderNamesEqual,
  parseOnedriveItemIdFromUrl,
} from "@/lib/onedrive/share-url";
import {
  getValidAccessToken,
  loadOnedriveTokens,
  saveOnedriveRoot,
  saveOnedriveTokens,
} from "@/lib/onedrive/tokens";
import { needsOnedriveReconnect } from "@/lib/onedrive/reconnect";

type GraphErrorBody = {
  error?: { message?: string; code?: string };
};

const GRAPH_BASE = "https://graph.microsoft.com/v1.0";

function bearerValue(token: string): string {
  return token.replace(/^Bearer\s+/i, "").trim();
}

function isJwtAuthError(message: string | undefined): boolean {
  return /IDX14100|JWT is not well formed/i.test(message ?? "");
}

function isVroomAuthError(message: string | undefined): boolean {
  return /UnauthenticatedVroomException|Vroom/i.test(message ?? "");
}

function graphErrorMessage(json: GraphErrorBody, status: number): string {
  const raw = json.error?.message || `Erreur Microsoft Graph (${status}).`;
  const code = json.error?.code ?? "";
  const combined = `${code} ${raw}`;
  if (
    isJwtAuthError(raw) ||
    isVroomAuthError(raw) ||
    /accessDenied|access denied|acc[eè]s refus[eé]/i.test(combined) ||
    status === 401 ||
    status === 403
  ) {
    return "Microsoft a refusé l’accès au OneDrive personnel. Réessayez, ou ouvrez l’onglet OneDrive puis « Connecter OneDrive ».";
  }
  return raw;
}

function meItemPath(itemId: string, suffix = ""): string {
  return `/me/drive/items/${itemId}${suffix}`;
}

async function fetchJson<T>(
  base: string,
  token: string,
  path: string,
  init?: RequestInit,
): Promise<{ ok: true; data: T } | { ok: false; status: number; json: T & GraphErrorBody }> {
  const res = await fetch(`${base}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${bearerValue(token)}`,
      ...(init?.body instanceof Buffer || init?.body instanceof Uint8Array
        ? {}
        : typeof init?.body === "string"
          ? { "Content-Type": "application/json" }
          : {}),
      ...(init?.headers ?? {}),
    },
  });
  if (res.status === 204) return { ok: true, data: undefined as T };
  const json = (await res.json().catch(() => ({}))) as T & GraphErrorBody;
  if (!res.ok) return { ok: false, status: res.status, json };
  return { ok: true, data: json };
}

async function graphFetch<T>(
  token: string,
  path: string,
  init?: RequestInit,
): Promise<T> {
  const graph = await fetchJson<T>(GRAPH_BASE, token, path, init);
  if (graph.ok) return graph.data;
  const message = graph.json.error?.message;
  const mePath = toGraphMeDrivePath(path);
  if (isJwtAuthError(message) && mePath && mePath !== path) {
    const retry = await fetchJson<T>(GRAPH_BASE, token, mePath, init);
    if (retry.ok) return retry.data;
    throw new Error(graphErrorMessage(retry.json, retry.status));
  }
  throw new Error(graphErrorMessage(graph.json, graph.status));
}

async function graphRequest(
  token: string,
  path: string,
  init?: RequestInit,
): Promise<Response> {
  const headers = {
    Authorization: `Bearer ${bearerValue(token)}`,
    ...(init?.headers ?? {}),
  };
  const graph = await fetch(`${GRAPH_BASE}${path}`, { ...init, headers });
  if (graph.ok) return graph;
  const mePath = toGraphMeDrivePath(path);
  if (!mePath || mePath === path) return graph;
  const clone = graph.clone();
  const json = (await clone.json().catch(() => ({}))) as GraphErrorBody;
  if (!isJwtAuthError(json.error?.message)) return graph;
  return fetch(`${GRAPH_BASE}${mePath}`, { ...init, headers });
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
  folder?: unknown;
  file?: unknown;
  parentReference?: { driveId?: string; id?: string };
};

async function listChildItems(
  token: string,
  parentId: string,
): Promise<DriveItem[]> {
  const items: DriveItem[] = [];
  let path: string =
    `${meItemPath(parentId)}/children?$select=id,name,folder,file,parentReference,webUrl&$top=200`;
  for (let pageIndex = 0; pageIndex < 10; pageIndex += 1) {
    const page: {
      value?: DriveItem[];
      "@odata.nextLink"?: string;
    } = await graphFetch(token, path);
    items.push(...(page.value ?? []));
    const next = page["@odata.nextLink"]?.trim();
    if (!next) break;
    const stripped = next.startsWith(GRAPH_BASE)
      ? next.slice(GRAPH_BASE.length)
      : next.replace(/^https:\/\/graph\.microsoft\.com\/v1\.0/i, "");
    if (!stripped.startsWith("/")) break;
    path = stripped;
  }
  return items;
}

async function findNamedChildFolder(
  token: string,
  parentId: string,
  name: string,
): Promise<DriveItem | null> {
  const wanted = sanitizeOnedriveName(name, "Client");
  const children = await listChildItems(token, parentId);
  const folders = children.filter((item) => item.folder && item.name);
  return (
    folders.find((item) => onedriveFolderNamesEqual(item.name ?? "", wanted)) ??
    null
  );
}

async function createNamedChildFolder(
  token: string,
  parentId: string,
  name: string,
): Promise<DriveItem> {
  return graphFetch<DriveItem>(token, `${meItemPath(parentId)}/children`, {
    method: "POST",
    body: JSON.stringify({
      name: sanitizeOnedriveName(name, "Client"),
      folder: {},
      "@microsoft.graph.conflictBehavior": "fail",
    }),
  });
}

async function followShareUrlItemId(shareUrl: string): Promise<string | null> {
  const direct = parseOnedriveItemIdFromUrl(shareUrl);
  if (direct) return direct;
  try {
    const res = await fetch(shareUrl, {
      method: "GET",
      redirect: "follow",
      headers: { Accept: "text/html,application/xhtml+xml" },
    });
    const fromFinal = parseOnedriveItemIdFromUrl(res.url);
    if (fromFinal) return fromFinal;
    const html = await res.text();
    const match = html.match(/resid=([^&"'\\s]+)/i);
    if (!match?.[1]) return null;
    return parseOnedriveItemIdFromUrl(
      `https://onedrive.live.com/redir?resid=${match[1]}`,
    );
  } catch {
    return null;
  }
}

async function driveItemById(
  token: string,
  itemId: string,
): Promise<DriveItem | null> {
  try {
    return await graphFetch<DriveItem>(
      token,
      `${meItemPath(itemId)}?$select=id,name,folder,file,parentReference,webUrl`,
    );
  } catch {
    return null;
  }
}

async function searchFolderByName(
  token: string,
  name: string,
): Promise<DriveItem | null> {
  const wanted = sanitizeOnedriveName(name, "Client");
  const safeQuery = wanted.replace(/['"]/g, " ").trim();
  if (!safeQuery) return null;
  try {
    const page = await graphFetch<{ value?: DriveItem[] }>(
      token,
      `/me/drive/root/search(q='${encodeURIComponent(safeQuery)}')?$select=id,name,folder,parentReference,webUrl&$top=25`,
    );
    const folders = (page.value ?? []).filter(
      (item) => item.folder && item.name,
    );
    return (
      folders.find((item) => onedriveFolderNamesEqual(item.name ?? "", wanted)) ??
      null
    );
  } catch {
    return null;
  }
}

async function resolveChantierUploadFolder(
  token: string,
  input: { shareUrl: string; folderName?: string },
): Promise<{ itemId: string; driveId: string }> {
  const fromUrl = await followShareUrlItemId(input.shareUrl);
  if (fromUrl) {
    const item = await driveItemById(token, fromUrl);
    if (item?.id && item.folder) {
      return {
        itemId: item.id,
        driveId: item.parentReference?.driveId || "",
      };
    }
  }
  try {
    return await resolveShareItem(token, input.shareUrl);
  } catch {
    // Compte Hotmail : /shares est souvent refusé (JWT). On cible le dossier par nom.
  }
  const folderName = input.folderName?.trim();
  if (folderName) {
    const root = await getRootFolder();
    const child = await findNamedChildFolder(token, root.itemId, folderName);
    if (child?.id) {
      return {
        itemId: child.id,
        driveId: child.parentReference?.driveId || root.driveId,
      };
    }
    const searched = await searchFolderByName(token, folderName);
    if (searched?.id) {
      return {
        itemId: searched.id,
        driveId: searched.parentReference?.driveId || root.driveId,
      };
    }
    const created = await createNamedChildFolder(token, root.itemId, folderName);
    return {
      itemId: created.id,
      driveId: created.parentReference?.driveId || root.driveId,
    };
  }
  throw new Error("Impossible de trouver le dossier OneDrive du chantier.");
}

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

export type OnedriveProbeResult = {
  connected: boolean;
  expired: boolean;
  account: string | null;
  error?: string;
  rootCached?: boolean;
  expiresAt?: string | null;
};

/** Vérifie un appel Graph réel, pas seulement la présence d’un jeton en base. */
export async function probeOnedriveConnection(): Promise<OnedriveProbeResult> {
  const row = await loadOnedriveTokens();
  if (!row?.refresh_token) {
    return { connected: false, expired: false, account: null };
  }
  const base = {
    account: row.account_label,
    rootCached: Boolean(row.root_item_id && row.root_drive_id),
    expiresAt: row.expires_at,
  };
  try {
    const token = await getValidAccessToken();
    const label =
      (await fetchOnedriveAccountLabel(token)) || row.account_label || null;
    // Même opération que /sauvegarde (liste du dossier Sauvegarde), pas un
    // simple GET /me/drive : ce GET peut réussir alors que Microsoft refuse
    // d’écrire ou de lister les dossiers métier.
    await listBackupFiles();
    return { ...base, connected: true, expired: false, account: label };
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Accès OneDrive impossible.";
    const expired = needsOnedriveReconnect(message);
    return {
      ...base,
      connected: false,
      expired,
      error: message,
    };
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
  if (row?.root_item_id) {
    try {
      const item = await graphFetch<DriveItem>(
        token,
        `${meItemPath(row.root_item_id)}?$select=id,parentReference`,
      );
      const driveId = item.parentReference?.driveId || row.root_drive_id;
      if (item.id && driveId) {
        return { itemId: item.id, driveId };
      }
    } catch {
      // Dossier déplacé ou lien périmé : on re-résout une fois.
    }
  }
  const cfg = getOnedriveConfig();
  try {
    const resolved = await resolveShareItem(token, cfg.rootShareUrl);
    await saveOnedriveRoot({
      root_item_id: resolved.itemId,
      root_drive_id: resolved.driveId,
    });
    return { itemId: resolved.itemId, driveId: resolved.driveId };
  } catch (err) {
    const message = err instanceof Error ? err.message : "";
    if (
      !isJwtAuthError(message) &&
      !isVroomAuthError(message) &&
      !/OneDrive personnel/i.test(message)
    ) {
      throw err;
    }
    const root = await graphFetch<DriveItem>(
      token,
      "/me/drive/root?$select=id,parentReference",
    );
    const driveId = root.parentReference?.driveId;
    if (!root.id || !driveId) {
      throw new Error("Impossible d’accéder à la racine OneDrive du compte.");
    }
    await saveOnedriveRoot({ root_item_id: root.id, root_drive_id: driveId });
    return { itemId: root.id, driveId };
  }
}

async function createShareLink(
  token: string,
  _driveId: string,
  itemId: string,
): Promise<string | null> {
  try {
    const created = await graphFetch<{ link?: { webUrl?: string } }>(
      token,
      `${meItemPath(itemId)}/createLink`,
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
    `${meItemPath(root.itemId)}/children`,
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
  const existing = await findNamedChildFolder(token, root.itemId, name);
  if (existing?.id) {
    return {
      itemId: existing.id,
      driveId: existing.parentReference?.driveId || root.driveId,
    };
  }
  try {
    const created = await createNamedChildFolder(token, root.itemId, name);
    return {
      itemId: created.id,
      driveId: created.parentReference?.driveId || root.driveId,
    };
  } catch {
    const retry = await findNamedChildFolder(token, root.itemId, name);
    if (retry?.id) {
      return {
        itemId: retry.id,
        driveId: retry.parentReference?.driveId || root.driveId,
      };
    }
    throw new Error(`Impossible de trouver ou créer le dossier « ${name} ».`);
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
        `${meItemPath(root.itemId)}:/${encodeURIComponent(name)}`,
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
    `${meItemPath(folder.itemId)}/children?$select=id,name,size,file,folder,createdDateTime,lastModifiedDateTime,webUrl&$top=200`,
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
    `${meItemPath(encodeURIComponent(itemId))}?$select=id,name,parentReference`,
  );
  const parentId = meta.parentReference?.id;
  if (!parentId || parentId !== folder.itemId) {
    throw new Error("Ce fichier n’est pas une sauvegarde du dossier Sauvegarde.");
  }
  const res = await graphRequest(
    token,
    `${meItemPath(encodeURIComponent(itemId))}/content`,
    { redirect: "follow" },
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
  const res = await graphRequest(
    token,
    `${meItemPath(folder.itemId)}:/${encodedName}:/content`,
    {
      method: "PUT",
      headers: {
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
    throw new Error(graphErrorMessage(json, res.status));
  }
  return { name: json.name || safeName, webUrl: json.webUrl };
}

async function uploadToMeDriveItem(
  token: string,
  itemId: string,
  fileName: string,
  bytes: Buffer | Uint8Array,
  contentType: string,
): Promise<void> {
  const safeName = sanitizeOnedriveName(fileName, "document.bin");
  const encodedName = encodeURIComponent(safeName);
  const raw = Buffer.from(bytes);
  const res = await graphRequest(
    token,
    `${meItemPath(itemId)}:/${encodedName}:/content`,
    {
      method: "PUT",
      headers: {
        "Content-Type": contentType,
        Prefer: "conflictBehavior=replace",
      },
      body: raw,
    },
  );
  if (!res.ok) {
    const json = (await res.json().catch(() => ({}))) as GraphErrorBody;
    throw new Error(graphErrorMessage(json, res.status));
  }
}

export async function uploadBytesToShareFolder(input: {
  shareUrl: string;
  fileName: string;
  bytes: Buffer | Uint8Array;
  contentType: string;
  folderName?: string;
}): Promise<void> {
  const token = await getValidAccessToken();
  const folder = await resolveChantierUploadFolder(token, {
    shareUrl: input.shareUrl,
    folderName: input.folderName,
  });
  await uploadToMeDriveItem(
    token,
    folder.itemId,
    input.fileName,
    input.bytes,
    input.contentType,
  );
}

export async function uploadPngToShareFolder(input: {
  shareUrl: string;
  fileName: string;
  pngBytes: Buffer;
  folderName?: string;
}): Promise<void> {
  await uploadBytesToShareFolder({
    shareUrl: input.shareUrl,
    fileName: input.fileName,
    bytes: input.pngBytes,
    contentType: "image/png",
    folderName: input.folderName,
  });
}

export async function uploadBytesToClientFolder(input: {
  nomClient: string;
  fileName: string;
  bytes: Buffer | Uint8Array;
  contentType: string;
}): Promise<void> {
  const folder = await ensureChildFolder(input.nomClient);
  const token = await getValidAccessToken();
  await uploadToMeDriveItem(
    token,
    folder.itemId,
    input.fileName,
    input.bytes,
    input.contentType,
  );
}

export async function sendGraphMail(input: {
  to: string[];
  cc?: string[];
  subject: string;
  text: string;
  html?: string;
  attachments?: { fileName: string; contentType: string; bytes: Uint8Array }[];
}): Promise<void> {
  const recipients = input.to
    .map((item) => item.trim())
    .filter(Boolean)
    .map((address) => ({ emailAddress: { address } }));
  if (recipients.length === 0) {
    throw new Error("Aucun destinataire e-mail.");
  }
  const cc = (input.cc ?? [])
    .map((item) => item.trim())
    .filter(Boolean)
    .map((address) => ({ emailAddress: { address } }));
  const attachments = (input.attachments ?? []).map((file) => ({
    "@odata.type": "#microsoft.graph.fileAttachment",
    name: file.fileName,
    contentType: file.contentType,
    contentBytes: Buffer.from(file.bytes).toString("base64"),
  }));
  const token = await getValidAccessToken();
  await graphFetch<void>(token, "/me/sendMail", {
    method: "POST",
    body: JSON.stringify({
      message: {
        subject: input.subject,
        body: input.html
          ? { contentType: "HTML", content: input.html }
          : { contentType: "Text", content: input.text },
        toRecipients: recipients,
        ccRecipients: cc.length ? cc : undefined,
        attachments: attachments.length ? attachments : undefined,
      },
      saveToSentItems: true,
    }),
  });
}
