import { NextRequest, NextResponse } from "next/server";
import { persistAccountLabel } from "@/lib/onedrive/graph";
import { getOnedriveConfig } from "@/lib/onedrive/config";
import {
  clearOauthStateCookie,
  originFromCallbackUri,
  onedriveRedirectUri,
  requestIsHttps,
  verifyOauthState,
} from "@/lib/onedrive/oauth-state";
import { exchangeAuthorizationCode } from "@/lib/onedrive/tokens";

const ADMIN = "/admin/onedrive";

function adminUrl(origin: string, query: string) {
  return `${origin}${ADMIN}${query}`;
}

export async function GET(request: NextRequest) {
  const url = request.nextUrl;
  const secure = requestIsHttps(request);
  const canonical = onedriveRedirectUri();
  const fallbackOrigin = originFromCallbackUri(canonical);
  const error = url.searchParams.get("error_description") || url.searchParams.get("error");
  const stateParam = url.searchParams.get("state");
  const verified = verifyOauthState(stateParam, Date.now(), canonical);
  const returnOrigin = verified.ok ? verified.returnOrigin : fallbackOrigin;

  if (error) {
    console.info("[onedrive-oauth] callback microsoft-error", { error });
    const response = NextResponse.redirect(
      adminUrl(returnOrigin, `?error=${encodeURIComponent(error)}`),
    );
    clearOauthStateCookie(response, secure);
    return response;
  }
  const code = url.searchParams.get("code");
  console.info("[onedrive-oauth] callback", {
    host: request.headers.get("host"),
    forwardedProto: request.headers.get("x-forwarded-proto"),
    hasCode: Boolean(code),
    hasStateParam: Boolean(stateParam),
    stateOk: verified.ok,
    returnOrigin,
    redirectUri: canonical,
  });
  if (!code || !verified.ok) {
    const response = NextResponse.redirect(
      adminUrl(
        returnOrigin,
        `?error=${encodeURIComponent("État OAuth invalide. Réessayez.")}`,
      ),
    );
    clearOauthStateCookie(response, secure);
    return response;
  }
  try {
    await exchangeAuthorizationCode(code, getOnedriveConfig().redirectUri);
    try {
      await persistAccountLabel();
    } catch {
      // Compte connecté même si /me échoue.
    }
    const response = NextResponse.redirect(adminUrl(returnOrigin, "?connected=1"));
    clearOauthStateCookie(response, secure);
    return response;
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Enregistrement du jeton OneDrive impossible.";
    console.error("[onedrive-oauth] token-exchange", message);
    const response = NextResponse.redirect(
      adminUrl(returnOrigin, `?error=${encodeURIComponent(message)}`),
    );
    clearOauthStateCookie(response, secure);
    return response;
  }
}
