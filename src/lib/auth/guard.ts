import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { lookupEmployeeAccess } from "@/lib/auth/employee-access";
import { asAdminFlag, normalizeId } from "@/lib/auth/ids";
import {
  decodeSession,
  SESSION_COOKIE,
  type SessionPayload,
} from "@/lib/auth/session";

export async function readSessionFromCookieValue(
  value: string | undefined,
): Promise<SessionPayload | null> {
  return decodeSession(value);
}

export async function getSessionFromRequest(
  request: NextRequest,
): Promise<SessionPayload | null> {
  return decodeSession(request.cookies.get(SESSION_COOKIE)?.value);
}

export async function getSession(): Promise<SessionPayload | null> {
  return decodeSession(cookies().get(SESSION_COOKIE)?.value);
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
