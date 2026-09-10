import { NextRequest, NextResponse } from "next/server";
import { runPlanningBackup } from "@/lib/backup/run";
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

function isAuthorized(request: NextRequest): boolean {
  const auth = request.headers.get("authorization");
  if (bearerMatches(auth, process.env.BACKUP_CRON_SECRET)) return true;
  if (bearerMatches(auth, process.env.CRON_SECRET)) return true;

  // Bouton admin : même origine, sans exposer le secret au navigateur.
  if (request.method === "POST") {
    const origin = request.headers.get("origin");
    if (origin && origin === request.nextUrl.origin) return true;
  }
  return false;
}

async function handle(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Non autorisé." }, { status: 401 });
  }
  try {
    const result = await runPlanningBackup();
    return NextResponse.json({
      ok: true,
      fileName: result.fileName,
      createdAt: result.createdAt,
      counts: result.counts,
      totalRows: result.totalRows,
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
