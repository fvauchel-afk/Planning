import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/guard";
import { getOnedriveConfig, ONEDRIVE_SCOPES } from "@/lib/onedrive/config";
import {
  ONEDRIVE_OAUTH_REDIRECT_COOKIE,
  ONEDRIVE_OAUTH_STATE_COOKIE,
  oauthStateCookieOptions,
  publicOrigin,
  requestIsHttps,
} from "@/lib/onedrive/oauth-state";

const NO_STORE = { "Cache-Control": "private, no-store, max-age=0" };

/** GET ne doit jamais 302 vers Microsoft : prefetch / SW / préchargement Chrome. */
export async function GET() {
  return NextResponse.json(
    {
      error:
        "La connexion OneDrive se lance uniquement depuis le bouton de l’onglet OneDrive.",
    },
    { status: 405, headers: NO_STORE },
  );
}

export async function POST(request: NextRequest) {
  const { response } = await requireAdmin(request);
  if (response) {
    response.headers.set("Cache-Control", NO_STORE["Cache-Control"]);
    return response;
  }
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
    const oauth = NextResponse.redirect(url.toString());
    const cookieOptions = oauthStateCookieOptions(secure);
    oauth.cookies.set(ONEDRIVE_OAUTH_STATE_COOKIE, state, cookieOptions);
    oauth.cookies.set(ONEDRIVE_OAUTH_REDIRECT_COOKIE, redirectUri, cookieOptions);
    oauth.headers.set("Cache-Control", NO_STORE["Cache-Control"]);
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
    return oauth;
  } catch (err) {
    const message = err instanceof Error ? err.message : "Connexion OneDrive impossible.";
    const origin =
      process.env.ONEDRIVE_REDIRECT_URI?.replace(/\/api\/onedrive\/callback\/?$/, "") ||
      request.nextUrl.origin;
    const fail = NextResponse.redirect(
      `${origin}/admin/onedrive?error=${encodeURIComponent(message)}`,
    );
    fail.headers.set("Cache-Control", NO_STORE["Cache-Control"]);
    return fail;
  }
}
