import { NextRequest, NextResponse } from "next/server";
import { getOnedriveConfig, ONEDRIVE_SCOPES } from "@/lib/onedrive/config";
import {
  ONEDRIVE_OAUTH_REDIRECT_COOKIE,
  ONEDRIVE_OAUTH_STATE_COOKIE,
  oauthStateCookieOptions,
  publicOrigin,
  requestIsHttps,
} from "@/lib/onedrive/oauth-state";

export async function GET(request: NextRequest) {
  try {
    const cfg = getOnedriveConfig();
    const state = crypto.randomUUID();
    const secure = requestIsHttps(request);
    const redirectUri = `${publicOrigin(request)}/api/onedrive/callback`;
    const url = new URL(
      `https://login.microsoftonline.com/${cfg.tenant}/oauth2/v2.0/authorize`,
    );
    url.searchParams.set("client_id", cfg.clientId);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("redirect_uri", redirectUri);
    url.searchParams.set("response_mode", "query");
    url.searchParams.set("scope", ONEDRIVE_SCOPES);
    url.searchParams.set("state", state);
    url.searchParams.set("prompt", "select_account");
    const response = NextResponse.redirect(url.toString());
    const cookieOptions = oauthStateCookieOptions(secure);
    response.cookies.set(ONEDRIVE_OAUTH_STATE_COOKIE, state, cookieOptions);
    response.cookies.set(ONEDRIVE_OAUTH_REDIRECT_COOKIE, redirectUri, cookieOptions);
    console.info("[onedrive-oauth] login", {
      host: request.headers.get("host"),
      forwardedProto: request.headers.get("x-forwarded-proto"),
      nextProtocol: request.nextUrl.protocol,
      secure,
      sameSite: "lax",
      path: "/",
      redirectUri,
      envRedirectUri: cfg.redirectUri,
      statePrefix: state.slice(0, 8),
    });
    return response;
  } catch (err) {
    const message = err instanceof Error ? err.message : "Connexion OneDrive impossible.";
    const origin =
      process.env.ONEDRIVE_REDIRECT_URI?.replace(/\/api\/onedrive\/callback\/?$/, "") ||
      request.nextUrl.origin;
    return NextResponse.redirect(
      `${origin}/admin/onedrive?error=${encodeURIComponent(message)}`,
    );
  }
}
