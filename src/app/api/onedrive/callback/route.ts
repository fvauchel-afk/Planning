import { NextRequest, NextResponse } from "next/server";
import { persistAccountLabel } from "@/lib/onedrive/graph";
import {
  ONEDRIVE_OAUTH_REDIRECT_COOKIE,
  ONEDRIVE_OAUTH_STATE_COOKIE,
  clearOauthStateCookie,
  requestIsHttps,
} from "@/lib/onedrive/oauth-state";
import { exchangeAuthorizationCode } from "@/lib/onedrive/tokens";

const ADMIN = "/admin/onedrive";

export async function GET(request: NextRequest) {
  const url = request.nextUrl;
  const secure = requestIsHttps(request);
  const error = url.searchParams.get("error_description") || url.searchParams.get("error");
  if (error) {
    console.info("[onedrive-oauth] callback microsoft-error", { error });
    const response = NextResponse.redirect(
      new URL(`${ADMIN}?error=${encodeURIComponent(error)}`, url.origin),
    );
    clearOauthStateCookie(response, secure);
    return response;
  }
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const expected = request.cookies.get(ONEDRIVE_OAUTH_STATE_COOKIE)?.value;
  const redirectUri = request.cookies.get(ONEDRIVE_OAUTH_REDIRECT_COOKIE)?.value;
  console.info("[onedrive-oauth] callback", {
    host: request.headers.get("host"),
    forwardedProto: request.headers.get("x-forwarded-proto"),
    secure,
    hasCode: Boolean(code),
    hasStateParam: Boolean(state),
    hasStateCookie: Boolean(expected),
    cookieNames: request.cookies.getAll().map((item) => item.name),
    stateParamLength: state?.length ?? 0,
    cookieLength: expected?.length ?? 0,
    equal: Boolean(state && expected && state === expected),
    stateParamPrefix: state?.slice(0, 8) ?? null,
    cookiePrefix: expected?.slice(0, 8) ?? null,
    redirectUri: redirectUri ?? null,
  });
  if (!code || !state || !expected || state !== expected) {
    const response = NextResponse.redirect(
      new URL(`${ADMIN}?error=${encodeURIComponent("État OAuth invalide. Réessayez.")}`, url.origin),
    );
    clearOauthStateCookie(response, secure);
    return response;
  }
  try {
    await exchangeAuthorizationCode(code, redirectUri);
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
    console.error("[onedrive-oauth] token-exchange", message);
    const response = NextResponse.redirect(
      new URL(`${ADMIN}?error=${encodeURIComponent(message)}`, url.origin),
    );
    clearOauthStateCookie(response, secure);
    return response;
  }
}
