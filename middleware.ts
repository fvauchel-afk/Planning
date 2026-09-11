import { NextRequest, NextResponse } from "next/server";
import { lookupEmployeeAccess } from "@/lib/auth/employee-access";
import {
  decodeSession,
  SESSION_COOKIE,
  type SessionPayload,
} from "@/lib/auth/session";

function isPublicPath(pathname: string): boolean {
  if (pathname === "/connexion") return true;
  if (pathname === "/api/auth/login") return true;
  if (pathname === "/api/health/supabase") return true;
  if (pathname === "/api/onedrive/callback") return true;
  if (pathname === "/api/backup/run") return true;
  return false;
}

function isSalarieAllowed(pathname: string): boolean {
  if (pathname === "/moi" || pathname.startsWith("/moi/")) return true;
  if (pathname === "/api/auth/me" || pathname === "/api/auth/logout") return true;
  if (pathname === "/api/planning/snapshot") return true;
  if (pathname === "/api/planning/mutate") return true;
  if (pathname === "/api/onedrive/upload-reception") return true;
  return false;
}

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

async function isAdminSession(session: SessionPayload): Promise<boolean> {
  const access = await lookupEmployeeAccess(session.employeeId);
  if (access) return access.isAdmin && access.actif;
  return session.isAdmin === true;
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (isPublicPath(pathname)) {
    if (pathname === "/connexion") {
      const session = await decodeSession(
        request.cookies.get(SESSION_COOKIE)?.value,
      );
      if (session) {
        const admin = await isAdminSession(session);
        const target = admin ? "/" : "/moi";
        return NextResponse.redirect(new URL(target, request.url));
      }
    }
    return NextResponse.next();
  }

  const session = await decodeSession(
    request.cookies.get(SESSION_COOKIE)?.value,
  );
  const isApi = pathname.startsWith("/api/");

  if (!session) {
    if (isApi) return jsonError("Non authentifié.", 401);
    const login = new URL("/connexion", request.url);
    login.searchParams.set("next", pathname);
    return NextResponse.redirect(login);
  }

  const access = await lookupEmployeeAccess(session.employeeId);
  if (access && !access.actif) {
    if (isApi) return jsonError("Compte inactif.", 403);
    const response = NextResponse.redirect(new URL("/connexion", request.url));
    response.cookies.set(SESSION_COOKIE, "", { path: "/", maxAge: 0 });
    return response;
  }

  const isAdmin = access ? access.isAdmin : session.isAdmin === true;
  if (!isAdmin && !isSalarieAllowed(pathname)) {
    if (isApi) return jsonError("Accès refusé.", 403);
    return NextResponse.redirect(new URL("/moi", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
