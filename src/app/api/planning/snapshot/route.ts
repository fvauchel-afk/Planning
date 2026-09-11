import { NextResponse } from "next/server";
import { filterSnapshotForSession } from "@/lib/auth/scope";
import { getSession, resolveSession, unauthorized } from "@/lib/auth/guard";
import { fetchSupabaseSnapshot } from "@/lib/store/supabase";
import {
  hasSupabaseServiceRole,
  isSupabaseUrlConfigured,
} from "@/lib/supabase/server";
import { wrapSupabaseError } from "@/lib/supabase/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const session = await resolveSession(await getSession());
  if (!session) return unauthorized();

  if (!isSupabaseUrlConfigured()) {
    return NextResponse.json({ usingSupabase: false, snapshot: null });
  }

  if (!hasSupabaseServiceRole()) {
    return NextResponse.json(
      {
        error:
          "Ajoutez SUPABASE_SERVICE_ROLE_KEY (clé service_role du dashboard Supabase) sur le serveur. Les pages ne lisent plus Supabase depuis le navigateur.",
      },
      { status: 500 },
    );
  }

  try {
    const snapshot = filterSnapshotForSession(
      await fetchSupabaseSnapshot(),
      session,
    );
    return NextResponse.json({ usingSupabase: true, snapshot });
  } catch (err) {
    return NextResponse.json(
      { error: wrapSupabaseError(err).message },
      { status: 500 },
    );
  }
}
