import { createHmac, timingSafeEqual } from "node:crypto";
import type { NextRequest, NextResponse } from "next/server";

export const ONEDRIVE_OAUTH_STATE_COOKIE = "onedrive_oauth_state";
export const ONEDRIVE_OAUTH_REDIRECT_COOKIE = "onedrive_oauth_redirect";

/** URI déjà enregistrée dans Azure — ne pas la dériver de l’hôte de la requête. */
export const CANONICAL_ONEDRIVE_CALLBACK =
  "https://planning-three-lime.vercel.app/api/onedrive/callback";

const LOCAL_CALLBACK = "http://localhost:3000/api/onedrive/callback";
const STATE_TTL_MS = 10 * 60 * 1000;

export function requestIsHttps(request: NextRequest): boolean {
  const forwarded = request.headers.get("x-forwarded-proto");
  if (forwarded) {
    return forwarded.split(",")[0]?.trim() === "https";
  }
  if (process.env.VERCEL === "1") return true;
  return request.nextUrl.protocol === "https:";
}

export function publicOrigin(request: NextRequest): string {
  const proto = requestIsHttps(request) ? "https" : "http";
  const host =
    request.headers.get("x-forwarded-host")?.split(",")[0]?.trim() ||
    request.headers.get("host") ||
    request.nextUrl.host;
  return `${proto}://${host}`;
}

export function originFromCallbackUri(callbackUri: string): string {
  try {
    return new URL(callbackUri).origin;
  } catch {
    return "https://planning-three-lime.vercel.app";
  }
}

export function resolveOnedriveRedirectUri(options?: {
  envUri?: string | null;
  vercel?: boolean;
}): string {
  const env = (options?.envUri ?? "").trim();
  if (env) return env;
  if (options?.vercel) return CANONICAL_ONEDRIVE_CALLBACK;
  return LOCAL_CALLBACK;
}

export function onedriveRedirectUri(): string {
  return resolveOnedriveRedirectUri({
    envUri: process.env.ONEDRIVE_REDIRECT_URI,
    vercel: process.env.VERCEL === "1",
  });
}

function allowedReturnOrigins(canonicalCallback: string): Set<string> {
  return new Set([
    originFromCallbackUri(canonicalCallback),
    "https://gestion.lametalleriedusud.com",
    "http://localhost:3000",
    "http://127.0.0.1:3000",
  ]);
}

export function sanitizeReturnOrigin(
  origin: string,
  canonicalCallback = onedriveRedirectUri(),
): string {
  const canonical = originFromCallbackUri(canonicalCallback);
  try {
    const url = new URL(origin);
    const normalized = `${url.protocol}//${url.host}`;
    if (allowedReturnOrigins(canonicalCallback).has(normalized)) {
      return normalized;
    }
  } catch {
    // ignore
  }
  return canonical;
}

function stateSecret(): string {
  return (
    process.env.AUTH_SECRET?.trim() ||
    process.env.BACKUP_CRON_SECRET?.trim() ||
    process.env.CRON_SECRET?.trim() ||
    process.env.ONEDRIVE_CLIENT_SECRET?.trim() ||
    "vauchel-dev-session-secret"
  );
}

function b64url(value: string | Buffer): string {
  const buf = typeof value === "string" ? Buffer.from(value, "utf8") : value;
  return buf
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function fromB64url(value: string): string {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/");
  const pad = padded.length % 4 === 0 ? "" : "=".repeat(4 - (padded.length % 4));
  return Buffer.from(padded + pad, "base64").toString("utf8");
}

function signBody(body: string): string {
  return b64url(createHmac("sha256", stateSecret()).update(body).digest());
}

export function createOauthState(
  returnOrigin: string,
  nowMs = Date.now(),
  canonicalCallback = onedriveRedirectUri(),
): string {
  const payload = {
    n: crypto.randomUUID(),
    exp: nowMs + STATE_TTL_MS,
    back: sanitizeReturnOrigin(returnOrigin, canonicalCallback),
  };
  const body = b64url(JSON.stringify(payload));
  return `${body}.${signBody(body)}`;
}

export function verifyOauthState(
  state: string | null | undefined,
  nowMs = Date.now(),
  canonicalCallback = onedriveRedirectUri(),
): { ok: true; returnOrigin: string } | { ok: false } {
  if (!state) return { ok: false };
  const [body, signature] = state.split(".");
  if (!body || !signature) return { ok: false };
  const expected = signBody(body);
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return { ok: false };
  try {
    const payload = JSON.parse(fromB64url(body)) as {
      n?: string;
      exp?: number;
      back?: string;
    };
    if (typeof payload.exp !== "number" || payload.exp < nowMs) return { ok: false };
    if (typeof payload.n !== "string" || !payload.n) return { ok: false };
    return {
      ok: true,
      returnOrigin: sanitizeReturnOrigin(
        typeof payload.back === "string" ? payload.back : "",
        canonicalCallback,
      ),
    };
  } catch {
    return { ok: false };
  }
}

export function oauthStateCookieOptions(secure: boolean) {
  return {
    httpOnly: true as const,
    secure,
    sameSite: "lax" as const,
    path: "/",
    maxAge: 600,
  };
}

export function clearOauthStateCookie(response: NextResponse, secure: boolean) {
  const options = {
    httpOnly: true as const,
    secure,
    sameSite: "lax" as const,
    path: "/",
    maxAge: 0,
  };
  response.cookies.set(ONEDRIVE_OAUTH_STATE_COOKIE, "", options);
  response.cookies.set(ONEDRIVE_OAUTH_REDIRECT_COOKIE, "", options);
}

function runOnedriveOauthSelfCheck() {
  const vercelUri = resolveOnedriveRedirectUri({ envUri: "", vercel: true });
  if (vercelUri !== CANONICAL_ONEDRIVE_CALLBACK) {
    throw new Error("onedrive-oauth: sans env, Vercel doit utiliser l’URI vercel.app");
  }
  const envUri = "https://planning-three-lime.vercel.app/api/onedrive/callback";
  if (resolveOnedriveRedirectUri({ envUri, vercel: false }) !== envUri) {
    throw new Error("onedrive-oauth: ONEDRIVE_REDIRECT_URI doit primer");
  }
  if (
    resolveOnedriveRedirectUri({ envUri: "http://localhost:3000/api/onedrive/callback" }) !==
    LOCAL_CALLBACK
  ) {
    throw new Error("onedrive-oauth: localhost pour le dev");
  }
  const canonical = CANONICAL_ONEDRIVE_CALLBACK;
  const custom = "https://gestion.lametalleriedusud.com";
  if (sanitizeReturnOrigin(custom, canonical) !== custom) {
    throw new Error("onedrive-oauth: le domaine atelier doit rester un retour autorisé");
  }
  if (
    sanitizeReturnOrigin("https://evil.example/phish", canonical) !==
    originFromCallbackUri(canonical)
  ) {
    throw new Error("onedrive-oauth: origine inconnue doit retomber sur vercel.app");
  }
  const now = Date.parse("2026-09-17T14:00:00.000Z");
  const state = createOauthState(custom, now, canonical);
  const ok = verifyOauthState(state, now + 1000, canonical);
  if (!ok.ok || ok.returnOrigin !== custom) {
    throw new Error("onedrive-oauth: state signé doit être accepté");
  }
  if (verifyOauthState(state, now + STATE_TTL_MS + 1, canonical).ok) {
    throw new Error("onedrive-oauth: state expiré doit être refusé");
  }
  if (verifyOauthState(`${state}x`, now + 1000, canonical).ok) {
    throw new Error("onedrive-oauth: state altéré doit être refusé");
  }
  if (verifyOauthState("uuid-sans-signature", now, canonical).ok) {
    throw new Error("onedrive-oauth: ancien uuid cookie ne doit plus suffire");
  }
}

runOnedriveOauthSelfCheck();
