import { NextRequest, NextResponse } from "next/server";
import { createSeedSnapshot } from "@/lib/seed";
import {
  encodeSession,
  requestIsHttps,
  sessionCookieOptions,
  SESSION_COOKIE,
} from "@/lib/auth/session";
import { asAdminFlag, normalizeId } from "@/lib/auth/ids";
import {
  createSupabaseAnonClient,
  createSupabaseServerClient,
  hasSupabaseServiceRole,
  isSupabaseServerConfigured,
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

function localUserForPin(pin: string) {
  const employees = createSeedSnapshot().employees.filter((item) => item.actif);
  const defaults: Record<string, string> = {};
  for (const employee of employees) {
    const lower = employee.nom.trim().toLowerCase();
    if (lower === "jonathan") defaults[employee.id] = "1111";
    else if (lower === "michael") defaults[employee.id] = "2222";
    else if (lower === "alexis") defaults[employee.id] = "3333";
    else defaults[employee.id] = "1234";
  }
  return (
    employees.find((employee) => defaults[employee.id] === pin) ?? null
  );
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

    let user: { id: string; nom: string; is_admin: boolean } | null = null;

    if (isSupabaseServerConfigured()) {
      const supabase = hasSupabaseServiceRole()
        ? createSupabaseServerClient()
        : createSupabaseAnonClient();
      const { data, error } = await supabase.rpc("login_with_pin", { p_pin: pin });
      if (error) {
        console.error("LOGIN_ERROR", error, errorDetails(error));
        return NextResponse.json(
          { error: "Une erreur est survenue, réessayez." },
          { status: 500 },
        );
      }
      const row = Array.isArray(data) ? data[0] : data;
      if (row?.id) {
        user = {
          id: normalizeId(String(row.id)) || String(row.id),
          nom: row.nom,
          is_admin: asAdminFlag(row.is_admin),
        };
      }
    } else {
      const local = localUserForPin(pin);
      if (local) {
        user = {
          id: local.id,
          nom: local.nom,
          is_admin: asAdminFlag(local.is_admin),
        };
      }
    }

    if (!user) {
      return NextResponse.json({ error: "Code PIN incorrect." }, { status: 401 });
    }

    const token = await encodeSession({
      employeeId: user.id,
      nom: user.nom,
      isAdmin: user.is_admin,
    });
    const response = NextResponse.json({
      user: {
        employeeId: user.id,
        nom: user.nom,
        isAdmin: user.is_admin,
      },
    });
    response.cookies.set(
      SESSION_COOKIE,
      token,
      sessionCookieOptions(requestIsHttps(request)),
    );
    return response;
  } catch (error) {
    console.error("LOGIN_ERROR", error, errorDetails(error));
    return NextResponse.json(
      { error: "Une erreur est survenue, réessayez." },
      { status: 500 },
    );
  }
}
