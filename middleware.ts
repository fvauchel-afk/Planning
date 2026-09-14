import { NextRequest, NextResponse } from "next/server";
import {
  decodeSession,
  SESSION_COOKIE,
} from "@/lib/auth/session";

function isPublicPath(pathname: string): boolean {
  if (pathname === "/connexion") return true;
  if (pathname === "/api/auth/login") return true;
  if (pathname === "/api/health/supabase") return true;
  if (pathname === "/api/onedrive/callback") return true;
  if (pathname === "/api/backup/run") return true;
  if (pathname === "/sw.js") return true;
  if (pathname === "/api/sw") return true;
  if (pathname === "/api/version") return true;
  if (pathname === "/manifest.webmanifest" || pathname === "/manifest.json") {
    return true;
  }
  return false;
}

function isSalarieAllowed(pathname: string): boolean {
  if (pathname === "/moi" || pathname.startsWith("/moi/")) return true;
  if (pathname === "/api/auth/me" || pathname === "/api/auth/logout") return true;
  if (pathname === "/api/planning/snapshot") return true;
  if (pathname === "/api/planning/mutate") return true;
  if (pathname === "/api/onedrive/upload-reception") return true;
  if (pathname === "/api/push/subscribe" || pathname === "/api/push/vapid") {
    return true;
  }
  return false;
}

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

async function middlewareInner(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (isPublicPath(pathname)) {
    if (pathname === "/connexion") {
      const session = await decodeSession(
        request.cookies.get(SESSION_COOKIE)?.value,
      );
      if (session) {
        const target = session.isAdmin ? "/" : "/moi";
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

  const isAdmin = session.isAdmin === true;
  if (!isAdmin && !isSalarieAllowed(pathname)) {
    if (isApi) return jsonError("Accès refusé.", 403);
    return NextResponse.redirect(new URL("/moi", request.url));
  }

  return NextResponse.next();
}

export async function middleware(request: NextRequest) {
  try {
    return await middlewareInner(request);
  } catch (err) {
    console.error("[middleware]", err);
    const { pathname } = request.nextUrl;
    if (isPublicPath(pathname)) return NextResponse.next();
    if (pathname.startsWith("/api/")) {
      return jsonError(
        "Impossible de se connecter à la base de données, réessayez plus tard.",
        503,
      );
    }
    const login = new URL("/connexion", request.url);
    return NextResponse.redirect(login);
  }
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|sw\\.js|manifest\\.webmanifest|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
