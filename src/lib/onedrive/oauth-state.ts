import type { NextResponse } from "next/server";

export const ONEDRIVE_OAUTH_STATE_COOKIE = "onedrive_oauth_state";

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
  response.cookies.set(ONEDRIVE_OAUTH_STATE_COOKIE, "", {
    httpOnly: true,
    secure,
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
}
