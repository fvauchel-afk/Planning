import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/auth/guard";
import { parisCalendarYmd } from "@/lib/dates";
import {
  lancementMailCibles,
} from "@/lib/engine/lancement-mail";
import { sendLancementReminderEmail } from "@/lib/mail/lancement";
import { fetchSupabaseSnapshot } from "@/lib/store/supabase";
import { isMissingSchemaError } from "@/lib/supabase/errors";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i += 1) {
    out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return out === 0;
}

function bearerMatches(header: string | null, secret: string | undefined): boolean {
  if (!header || !secret) return false;
  const prefix = "Bearer ";
  if (!header.startsWith(prefix)) return false;
  const token = header.slice(prefix.length).trim();
  if (!token || token.length !== secret.length) return false;
  return timingSafeEqual(token, secret);
}

async function isAuthorized(request: NextRequest): Promise<boolean> {
  const auth = request.headers.get("authorization");
  if (bearerMatches(auth, process.env.BACKUP_CRON_SECRET)) return true;
  if (bearerMatches(auth, process.env.CRON_SECRET)) return true;
  if (request.method === "POST") {
    const origin = request.headers.get("origin");
    if (origin && origin === request.nextUrl.origin) {
      const session = await getSessionFromRequest(request);
      return Boolean(session?.isAdmin);
    }
  }
  return false;
}

async function handle(request: NextRequest) {
  if (!(await isAuthorized(request))) {
    return NextResponse.json({ error: "Non autorisé." }, { status: 401 });
  }
  try {
    const snapshot = await fetchSupabaseSnapshot();
    const today = parisCalendarYmd();
    const origin = request.nextUrl.origin;
    const cibles = lancementMailCibles(snapshot, today);
    const sent: string[] = [];
    const skipped: { phaseId: string; reason: string }[] = [];
    for (const row of cibles) {
      if (row.skipReason) {
        skipped.push({ phaseId: row.phaseId, reason: row.skipReason });
        continue;
      }
      const result = await sendLancementReminderEmail(
        row,
        `${origin}/chantiers?fiche=${row.chantierId}`,
      );
      if (result.sent) sent.push(row.phaseId);
      else skipped.push({ phaseId: row.phaseId, reason: result.skipped || "erreur" });
    }
    return NextResponse.json({
      ok: true,
      today,
      sent: sent.length,
      skipped: skipped.length,
      details: { sent, skipped },
    });
  } catch (err) {
    const message = isMissingSchemaError(err)
      ? "Tables Supabase introuvables."
      : err instanceof Error
        ? err.message
        : "Rappel lancement impossible.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  return handle(request);
}

export async function POST(request: NextRequest) {
  return handle(request);
}
