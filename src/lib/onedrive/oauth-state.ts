import type { NextRequest, NextResponse } from "next/server";

export const ONEDRIVE_OAUTH_STATE_COOKIE = "onedrive_oauth_state";
export const ONEDRIVE_OAUTH_REDIRECT_COOKIE = "onedrive_oauth_redirect";

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
