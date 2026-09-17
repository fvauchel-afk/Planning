import { NextResponse } from "next/server";
import { filterSnapshotForSession } from "@/lib/auth/scope";
import { getSession, resolveSession, unauthorized } from "@/lib/auth/guard";
import { administratifIdlePlans } from "@/lib/engine/administratif-idle";
import { fetchSupabaseSnapshot, supabaseCreateSignalement } from "@/lib/store/supabase";
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
        const plans = administratifIdlePlans(snapshot);
        for (const plan of plans) {
          await supabaseCreateSignalement({
            employe_id: plan.employeeId,
            phase_id: null,
            retard_demi_journees: 0,
            sens: "avance",
            note: plan.proposition.message,
            origine: "decalage_admin",
            proposition: plan.proposition,
          });
        }
        if (plans.length > 0) {
          snapshot = await fetchSupabaseSnapshot();
        }
      } catch (err) {
        console.warn(
          "[administratif-idle]",
          err instanceof Error ? err.message : "suggestion impossible",
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
