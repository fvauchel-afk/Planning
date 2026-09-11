import { NextRequest, NextResponse } from "next/server";
import { requestIsHttps, SESSION_COOKIE } from "@/lib/auth/session";

export async function POST(request: NextRequest) {
  const response = NextResponse.json({ ok: true });
  response.cookies.set(SESSION_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: requestIsHttps(request),
    path: "/",
    maxAge: 0,
  });
  return response;
}
