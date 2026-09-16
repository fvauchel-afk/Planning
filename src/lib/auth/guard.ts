import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import {
  lookupEmployeeAccess,
  lookupJonathanAdmin,
} from "@/lib/auth/employee-access";
import { asAdminFlag, normalizeId } from "@/lib/auth/ids";
import {
  decodeSession,
  SESSION_COOKIE,
  type SessionPayload,
} from "@/lib/auth/session";
import {
  CHECK_ADMIN_FALLBACK,
  isAuthTemporarilyOpen,
} from "@/lib/auth/temp-open-check";

let openCheckCache: { at: number; session: SessionPayload | null } | null = null;
const OPEN_CHECK_CACHE_MS = 30_000;

async function sessionFromOpenCheck(): Promise<SessionPayload | null> {
  if (!isAuthTemporarilyOpen()) {
    openCheckCache = null;
    return null;
  }
  const now = Date.now();
  if (openCheckCache && now - openCheckCache.at < OPEN_CHECK_CACHE_MS) {
    return openCheckCache.session;
  }
  const jonathan = await lookupJonathanAdmin();
  const session: SessionPayload = jonathan
    ? {
        employeeId: normalizeId(jonathan.id) || jonathan.id,
        nom: jonathan.nom.trim() || CHECK_ADMIN_FALLBACK.nom,
        isAdmin: true,
        exp: now + 24 * 60 * 60 * 1000,
      }
    : {
        employeeId: CHECK_ADMIN_FALLBACK.employeeId,
        nom: CHECK_ADMIN_FALLBACK.nom,
        isAdmin: true,
        exp: now + 24 * 60 * 60 * 1000,
      };
  openCheckCache = { at: now, session };
  return session;
}

export async function readSessionFromCookieValue(
  value: string | undefined,
): Promise<SessionPayload | null> {
  return (await decodeSession(value)) ?? sessionFromOpenCheck();
}

export async function getSessionFromRequest(
  request: NextRequest,
): Promise<SessionPayload | null> {
  return (
    (await decodeSession(request.cookies.get(SESSION_COOKIE)?.value)) ??
    sessionFromOpenCheck()
  );
}

export async function getSession(): Promise<SessionPayload | null> {
  return (
    (await decodeSession(cookies().get(SESSION_COOKIE)?.value)) ??
    sessionFromOpenCheck()
  );
}

export async function resolveSession(
  session: SessionPayload | null,
): Promise<SessionPayload | null> {
  if (!session) return null;
  const access = await lookupEmployeeAccess(session.employeeId);
  if (access && !access.actif) return null;
  return {
    ...session,
    employeeId: normalizeId(access?.id ?? session.employeeId) || session.employeeId,
    nom: access?.nom?.trim() || session.nom,
    isAdmin: access ? access.isAdmin : asAdminFlag(session.isAdmin),
  };
}

export function unauthorized(message = "Non authentifié.") {
  return NextResponse.json({ error: message }, { status: 401 });
}

export function forbidden(message = "Accès refusé.") {
  return NextResponse.json({ error: message }, { status: 403 });
}

export async function requireSession(request?: NextRequest) {
  const raw = request
    ? await getSessionFromRequest(request)
    : await getSession();
  const session = await resolveSession(raw);
  if (!session) return { session: null, response: unauthorized() };
  return { session, response: null };
}

export async function requireAdmin(request?: NextRequest) {
  const { session, response } = await requireSession(request);
  if (response || !session) {
    return { session: null, response: response ?? unauthorized() };
  }
  if (!session.isAdmin) {
    return { session, response: forbidden() };
  }
  return { session, response: null };
}
