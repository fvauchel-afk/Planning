import { NextRequest, NextResponse } from "next/server";
import {
  encodeSession,
  requestIsHttps,
  sessionCookieOptions,
  SESSION_COOKIE,
  type SessionUser,
} from "@/lib/auth/session";
import { asAdminFlag } from "@/lib/auth/ids";
import { lookupEmployeeAccess } from "@/lib/auth/employee-access";
import {
  exclusiveLoginRow,
  rpcDataToLoginRows,
  sessionMatchesVerifiedEmployee,
  verifiedSessionFromEmployee,
} from "@/lib/auth/login-identity";
import { employeesMatchingPin } from "@/lib/auth/pin-verify";
import {
  createSupabaseAnonClient,
  createSupabaseServerClient,
  hasSupabaseServiceRole,
  isSupabaseUrlConfigured,
} from "@/lib/supabase/server";

const attempts = new Map<string, { count: number; resetAt: number }>();
const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 8;

function clientKey(request: NextRequest): string {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    "unknown"
  );
}

function rateLimited(key: string): boolean {
  const now = Date.now();
  const current = attempts.get(key);
  if (!current || current.resetAt < now) {
    attempts.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return false;
  }
  current.count += 1;
  return current.count > MAX_ATTEMPTS;
}

function errorDetails(error: unknown) {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
      cause:
        error.cause instanceof Error
          ? { name: error.cause.name, message: error.cause.message }
          : error.cause ?? null,
    };
  }
  if (error && typeof error === "object") {
    const obj = error as Record<string, unknown>;
    return {
      name: obj.name ?? null,
      message: obj.message ?? String(error),
      code: obj.code ?? null,
      details: obj.details ?? null,
      hint: obj.hint ?? null,
      stack: obj.stack ?? null,
    };
  }
  return { message: String(error) };
}

function isPinCollisionError(error: unknown): boolean {
  const message =
    error && typeof error === "object" && "message" in error
      ? String((error as { message?: unknown }).message ?? "")
      : String(error ?? "");
  return message.includes("PIN_NOT_UNIQUE");
}

async function sessionResponse(request: NextRequest, user: SessionUser) {
  const token = await encodeSession(user);
  const response = NextResponse.json({ user });
  response.cookies.set(
    SESSION_COOKIE,
    token,
    sessionCookieOptions(requestIsHttps(request)),
  );
  return response;
}

export async function POST(request: NextRequest) {
  try {
    const key = clientKey(request);
    if (rateLimited(key)) {
      return NextResponse.json(
        { error: "Trop de tentatives. Réessayez dans quelques minutes." },
        { status: 429 },
      );
    }

    let pin = "";
    try {
      const body = (await request.json()) as { pin?: string };
      pin = String(body.pin ?? "").trim();
    } catch {
      return NextResponse.json({ error: "Requête invalide." }, { status: 400 });
    }

    if (!/^\d{4}$/.test(pin)) {
      return NextResponse.json(
        { error: "Le code PIN doit contenir 4 chiffres." },
        { status: 400 },
      );
    }

    if (!isSupabaseUrlConfigured()) {
      console.error("LOGIN_ERROR", "supabase-not-configured");
      return NextResponse.json(
        { error: "Une erreur est survenue, réessayez." },
        { status: 500 },
      );
    }

    if (hasSupabaseServiceRole()) {
      const supabase = createSupabaseServerClient();
      const { data, error } = await supabase
        .from("employees")
        .select("id, nom, is_admin, actif, pin_hash")
        .eq("actif", true)
        .not("pin_hash", "is", null);
      if (error) {
        console.error("LOGIN_ERROR", error, errorDetails(error));
        return NextResponse.json(
          { error: "Une erreur est survenue, réessayez." },
          { status: 500 },
        );
      }
      const matches = await employeesMatchingPin(pin, data ?? []);
      if (matches.length > 1) {
        console.error("LOGIN_PIN_COLLISION", {
          count: matches.length,
          noms: matches.map((row) => row.nom),
        });
        return NextResponse.json(
          { error: "Une erreur est survenue, réessayez." },
          { status: 500 },
        );
      }
      const match = matches[0];
      if (!match || match.actif === false) {
        return NextResponse.json({ error: "Code PIN incorrect." }, { status: 401 });
      }
      const user = verifiedSessionFromEmployee({
        id: String(match.id),
        nom: String(match.nom),
        is_admin: asAdminFlag(match.is_admin),
      });
      if (
        !sessionMatchesVerifiedEmployee(user, {
          id: String(match.id),
          nom: String(match.nom),
        })
      ) {
        console.error("LOGIN_IDENTITY_MISMATCH", { id: match.id });
        return NextResponse.json(
          { error: "Une erreur est survenue, réessayez." },
          { status: 500 },
        );
      }
      return sessionResponse(request, user);
    }

    const supabase = createSupabaseAnonClient();
    const { data, error } = await supabase.rpc("login_with_pin", { p_pin: pin });
    if (error) {
      if (isPinCollisionError(error)) {
        console.error("LOGIN_PIN_COLLISION");
      } else {
        console.error("LOGIN_ERROR", error, errorDetails(error));
      }
      return NextResponse.json(
        { error: "Une erreur est survenue, réessayez." },
        { status: 500 },
      );
    }

    const exclusive = exclusiveLoginRow(rpcDataToLoginRows(data));
    if (exclusive.status === "ambiguous") {
      console.error("LOGIN_PIN_COLLISION", "rpc-returned-multiple-rows");
      return NextResponse.json(
        { error: "Une erreur est survenue, réessayez." },
        { status: 500 },
      );
    }
    if (exclusive.status === "empty") {
      return NextResponse.json({ error: "Code PIN incorrect." }, { status: 401 });
    }

    const rpcRow = exclusive.row;
    const verified = await lookupEmployeeAccess(rpcRow.id);
    if (verified) {
      if (!verified.actif) {
        return NextResponse.json({ error: "Code PIN incorrect." }, { status: 401 });
      }
      const user = verifiedSessionFromEmployee({
        id: verified.id,
        nom: verified.nom,
        is_admin: verified.isAdmin,
      });
      if (
        !sessionMatchesVerifiedEmployee(
          { employeeId: rpcRow.id, nom: rpcRow.nom },
          { id: verified.id, nom: verified.nom },
        )
      ) {
        console.error("LOGIN_IDENTITY_MISMATCH", {
          rpcId: rpcRow.id,
          dbId: verified.id,
        });
        return NextResponse.json(
          { error: "Une erreur est survenue, réessayez." },
          { status: 500 },
        );
      }
      return sessionResponse(request, user);
    }

    return sessionResponse(
      request,
      verifiedSessionFromEmployee({
        id: rpcRow.id,
        nom: rpcRow.nom,
        is_admin: asAdminFlag(rpcRow.is_admin),
      }),
    );
  } catch (error) {
    console.error("LOGIN_ERROR", error, errorDetails(error));
    return NextResponse.json(
      { error: "Une erreur est survenue, réessayez." },
      { status: 500 },
    );
  }
}
