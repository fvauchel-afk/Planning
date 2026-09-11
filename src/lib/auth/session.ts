const COOKIE_NAME = "vauchel_session";
const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

export const SESSION_COOKIE = COOKIE_NAME;

export type SessionUser = {
  employeeId: string;
  nom: string;
  isAdmin: boolean;
};

export type SessionPayload = SessionUser & { exp: number };

function authSecret(): string {
  return (
    process.env.AUTH_SECRET?.trim() ||
    process.env.BACKUP_CRON_SECRET?.trim() ||
    process.env.CRON_SECRET?.trim() ||
    process.env.ONEDRIVE_CLIENT_SECRET?.trim() ||
    "vauchel-dev-session-secret"
  );
}

function bytesToBase64Url(bytes: ArrayBuffer | Uint8Array): string {
  const buffer = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let binary = "";
  for (let i = 0; i < buffer.length; i += 1) {
    binary += String.fromCharCode(buffer[i]!);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlToBytes(value: string): Uint8Array {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/");
  const pad = padded.length % 4 === 0 ? "" : "=".repeat(4 - (padded.length % 4));
  const binary = atob(padded + pad);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    out[i] = binary.charCodeAt(i);
  }
  return out;
}

async function hmacSign(data: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(authSecret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(data),
  );
  return bytesToBase64Url(signature);
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

export async function encodeSession(user: SessionUser): Promise<string> {
  const payload: SessionPayload = { ...user, exp: Date.now() + MAX_AGE_MS };
  const body = bytesToBase64Url(new TextEncoder().encode(JSON.stringify(payload)));
  const signature = await hmacSign(body);
  return `${body}.${signature}`;
}

export async function decodeSession(
  token: string | undefined | null,
): Promise<SessionPayload | null> {
  if (!token) return null;
  const [body, signature] = token.split(".");
  if (!body || !signature) return null;
  const expected = await hmacSign(body);
  if (!timingSafeEqual(expected, signature)) return null;
  try {
    const json = JSON.parse(
      new TextDecoder().decode(base64UrlToBytes(body)),
    ) as SessionPayload;
    if (!json.employeeId || !json.nom || typeof json.isAdmin !== "boolean") {
      return null;
    }
    if (typeof json.exp !== "number" || json.exp < Date.now()) return null;
    return json;
  } catch {
    return null;
  }
}

export function sessionCookieOptions(secure: boolean) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure,
    path: "/",
    maxAge: Math.floor(MAX_AGE_MS / 1000),
  };
}

export function requestIsHttps(request: {
  headers: { get(name: string): string | null };
  nextUrl?: { protocol: string };
}): boolean {
  const forwarded = request.headers.get("x-forwarded-proto");
  if (forwarded) return forwarded.split(",")[0]?.trim() === "https";
  if (process.env.VERCEL) return true;
  return request.nextUrl?.protocol === "https:";
}
