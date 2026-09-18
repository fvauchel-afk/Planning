import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/guard";
import { getOnedriveConfig, ONEDRIVE_SCOPES } from "@/lib/onedrive/config";
import {
  createOauthState,
  onedriveRedirectUri,
  publicOrigin,
  sanitizeReturnOrigin,
} from "@/lib/onedrive/oauth-state";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const NO_STORE = { "Cache-Control": "private, no-store, max-age=0" };

/** 303 : un 307/308 garderait le POST du bouton HTML, Microsoft exige alors client_id dans le body. */
function redirectSeeOther(url: string) {
  const response = NextResponse.redirect(url, 303);
  response.headers.set("Cache-Control", NO_STORE["Cache-Control"]);
  return response;
}

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
    const redirectUri = onedriveRedirectUri();
    const returnOrigin = sanitizeReturnOrigin(publicOrigin(request), redirectUri);
    const state = createOauthState(returnOrigin, Date.now(), redirectUri);
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
    if (!url.searchParams.get("client_id")) {
      throw new Error(
        "OneDrive n’est pas configuré (ONEDRIVE_CLIENT_ID / ONEDRIVE_CLIENT_SECRET).",
      );
    }
    console.info("[onedrive-oauth] login", {
      host: request.headers.get("host"),
      forwardedProto: request.headers.get("x-forwarded-proto"),
      redirectUri,
      returnOrigin,
      envRedirectUri: cfg.redirectUri,
      hasClientId: true,
      tenant: cfg.tenant,
    });
    return redirectSeeOther(url.toString());
  } catch (err) {
    const message = err instanceof Error ? err.message : "Connexion OneDrive impossible.";
    const origin = sanitizeReturnOrigin(publicOrigin(request));
    return redirectSeeOther(
      `${origin}/admin/onedrive?error=${encodeURIComponent(message)}`,
    );
  }
}
