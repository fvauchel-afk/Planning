import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/auth/guard";
import { runPlanningBackup } from "@/lib/backup/run";
import type { BackupTrigger } from "@/lib/backup/meta";
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

async function triggerFromRequest(request: NextRequest): Promise<BackupTrigger> {
  const query = request.nextUrl.searchParams.get("reason");
  if (query === "deploy" || query === "daily" || query === "manual") return query;
  if (request.method === "GET") return "daily";
  try {
    const clone = request.clone();
    const body = (await clone.json()) as { reason?: string };
    if (body.reason === "deploy" || body.reason === "daily" || body.reason === "manual") {
      return body.reason;
    }
  } catch {
    // pas de JSON
  }
  return "manual";
}
async function handle(request: NextRequest) {
  if (!(await isAuthorized(request))) {
    return NextResponse.json({ error: "Non autorisé." }, { status: 401 });
  }
  try {
    const trigger = await triggerFromRequest(request);
    const result = await runPlanningBackup({ trigger });
    return NextResponse.json({
      ok: true,
      fileName: result.fileName,
      createdAt: result.createdAt,
      counts: result.counts,
      totalRows: result.totalRows,
      trigger: result.trigger,
    });
  } catch (err) {
    const message = isMissingSchemaError(err)
      ? "Tables Supabase introuvables. Exécutez les migrations SQL avant de sauvegarder."
      : err instanceof Error
        ? err.message
        : "Sauvegarde impossible.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  return handle(request);
}

export async function POST(request: NextRequest) {
  return handle(request);
}
