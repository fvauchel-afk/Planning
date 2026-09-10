import { NextRequest, NextResponse } from "next/server";
import { getOnedriveConfig, ONEDRIVE_SCOPES } from "@/lib/onedrive/config";
import {
  ONEDRIVE_OAUTH_STATE_COOKIE,
  oauthStateCookieOptions,
} from "@/lib/onedrive/oauth-state";

export async function GET(request: NextRequest) {
  try {
    const cfg = getOnedriveConfig();
    const state = crypto.randomUUID();
    const url = new URL(
      `https://login.microsoftonline.com/${cfg.tenant}/oauth2/v2.0/authorize`,
    );
    url.searchParams.set("client_id", cfg.clientId);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("redirect_uri", cfg.redirectUri);
    url.searchParams.set("response_mode", "query");
    url.searchParams.set("scope", ONEDRIVE_SCOPES);
    url.searchParams.set("state", state);
    url.searchParams.set("prompt", "select_account");
    const response = NextResponse.redirect(url.toString());
    response.cookies.set(
      ONEDRIVE_OAUTH_STATE_COOKIE,
      state,
      oauthStateCookieOptions(request.nextUrl.protocol === "https:"),
    );
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
