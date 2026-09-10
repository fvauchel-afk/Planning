import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getOnedriveConfig, ONEDRIVE_SCOPES } from "@/lib/onedrive/config";

const STATE_COOKIE = "onedrive_oauth_state";

export async function GET() {
  try {
    const cfg = getOnedriveConfig();
    const state = crypto.randomUUID();
    cookies().set(STATE_COOKIE, state, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 600,
    });
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
    return NextResponse.redirect(url.toString());
  } catch (err) {
    const message = err instanceof Error ? err.message : "Connexion OneDrive impossible.";
    const origin =
      process.env.ONEDRIVE_REDIRECT_URI?.replace(/\/api\/onedrive\/callback\/?$/, "") ||
      "http://localhost:3000";
    return NextResponse.redirect(
      `${origin}/admin/onedrive?error=${encodeURIComponent(message)}`,
    );
  }
}
