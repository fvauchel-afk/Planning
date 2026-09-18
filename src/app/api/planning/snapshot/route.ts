import { NextResponse } from "next/server";
import { filterSnapshotForSession } from "@/lib/auth/scope";
import { getSession, resolveSession, unauthorized } from "@/lib/auth/guard";
import { applyAdministratifIdleAutofill } from "@/lib/engine/administratif-idle-apply";
import { fetchSupabaseSnapshot } from "@/lib/store/supabase";
import {
  hasSupabaseServiceRole,
  isSupabaseUrlConfigured,
} from "@/lib/supabase/server";
import {
  DATABASE_UNAVAILABLE_MESSAGE,
  wrapSupabaseError,
} from "@/lib/supabase/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET() {
  const session = await resolveSession(await getSession());
  if (!session) return unauthorized();

  if (!isSupabaseUrlConfigured() || !hasSupabaseServiceRole()) {
    const missingService =
      isSupabaseUrlConfigured() && !hasSupabaseServiceRole();
    return NextResponse.json(
      {
        error: missingService
          ? "Ajoutez SUPABASE_SERVICE_ROLE_KEY (clé service_role du dashboard Supabase) sur le serveur."
          : DATABASE_UNAVAILABLE_MESSAGE,
        usingSupabase: false,
        snapshot: null,
      },
      { status: 503 },
    );
  }

  try {
    let snapshot = await fetchSupabaseSnapshot();
    if (session.isAdmin) {
      try {
        snapshot = await applyAdministratifIdleAutofill(snapshot);
      } catch (err) {
        console.warn(
          "[administratif-idle]",
          err instanceof Error ? err.message : "remplissage Administratif impossible",
        );
      }
    }
    return NextResponse.json({
      usingSupabase: true,
      snapshot: filterSnapshotForSession(snapshot, session),
    });
  } catch (err) {
    return NextResponse.json(
      { error: wrapSupabaseError(err).message, usingSupabase: false },
      { status: 503 },
    );
  }
}
