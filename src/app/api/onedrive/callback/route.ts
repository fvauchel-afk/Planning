import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { persistAccountLabel } from "@/lib/onedrive/graph";
import { exchangeAuthorizationCode } from "@/lib/onedrive/tokens";

const STATE_COOKIE = "onedrive_oauth_state";
const ADMIN = "/admin/onedrive";

export async function GET(request: NextRequest) {
  const url = request.nextUrl;
  const error = url.searchParams.get("error_description") || url.searchParams.get("error");
  if (error) {
    return NextResponse.redirect(new URL(`${ADMIN}?error=${encodeURIComponent(error)}`, url.origin));
  }
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const expected = cookies().get(STATE_COOKIE)?.value;
  cookies().set(STATE_COOKIE, "", { path: "/", maxAge: 0 });
  if (!code || !state || !expected || state !== expected) {
    return NextResponse.redirect(
      new URL(`${ADMIN}?error=${encodeURIComponent("État OAuth invalide. Réessayez.")}`, url.origin),
    );
  }
  try {
    await exchangeAuthorizationCode(code);
    try {
      await persistAccountLabel();
    } catch {
      // Compte connecté même si /me échoue.
    }
    return NextResponse.redirect(new URL(`${ADMIN}?connected=1`, url.origin));
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Enregistrement du jeton OneDrive impossible.";
    return NextResponse.redirect(
      new URL(`${ADMIN}?error=${encodeURIComponent(message)}`, url.origin),
    );
  }
}
