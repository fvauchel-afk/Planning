import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest, resolveSession } from "@/lib/auth/guard";
import { canRestorePlanning } from "@/lib/auth/restore-access";
import { listBackupFiles } from "@/lib/onedrive/graph";
import { wrapSupabaseError } from "@/lib/supabase/errors";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const session = await resolveSession(await getSessionFromRequest(request));
  if (!session?.isAdmin) {
    return NextResponse.json({ error: "Accès refusé." }, { status: 403 });
  }
  try {
    const files = await listBackupFiles();
    return NextResponse.json({
      files,
      canRestore: canRestorePlanning(session.nom),
    });
  } catch (err) {
    return NextResponse.json(
      { error: wrapSupabaseError(err).message },
      { status: 500 },
    );
  }
}
