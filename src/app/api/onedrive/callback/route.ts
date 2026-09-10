import { NextRequest, NextResponse } from "next/server";
import { persistAccountLabel } from "@/lib/onedrive/graph";
import {
  ONEDRIVE_OAUTH_STATE_COOKIE,
  clearOauthStateCookie,
} from "@/lib/onedrive/oauth-state";
import { exchangeAuthorizationCode } from "@/lib/onedrive/tokens";

const ADMIN = "/admin/onedrive";

export async function GET(request: NextRequest) {
  const url = request.nextUrl;
  const secure = url.protocol === "https:";
  const error = url.searchParams.get("error_description") || url.searchParams.get("error");
  if (error) {
    const response = NextResponse.redirect(
      new URL(`${ADMIN}?error=${encodeURIComponent(error)}`, url.origin),
    );
    clearOauthStateCookie(response, secure);
    return response;
  }
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const expected = request.cookies.get(ONEDRIVE_OAUTH_STATE_COOKIE)?.value;
  if (!code || !state || !expected || state !== expected) {
    const response = NextResponse.redirect(
      new URL(`${ADMIN}?error=${encodeURIComponent("État OAuth invalide. Réessayez.")}`, url.origin),
    );
    clearOauthStateCookie(response, secure);
    return response;
  }
  try {
    await exchangeAuthorizationCode(code);
    try {
      await persistAccountLabel();
    } catch {
      // Compte connecté même si /me échoue.
    }
    const response = NextResponse.redirect(new URL(`${ADMIN}?connected=1`, url.origin));
    clearOauthStateCookie(response, secure);
    return response;
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Enregistrement du jeton OneDrive impossible.";
    const response = NextResponse.redirect(
      new URL(`${ADMIN}?error=${encodeURIComponent(message)}`, url.origin),
    );
    clearOauthStateCookie(response, secure);
    return response;
  }
}
