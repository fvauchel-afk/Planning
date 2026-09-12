import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest, resolveSession } from "@/lib/auth/guard";
import {
  canRestorePlanning,
  RESTORE_CONFIRM_PHRASE,
} from "@/lib/auth/restore-access";
import { restorePlanningBackup } from "@/lib/backup/restore";
import { invalidateSupabaseSnapshotCache } from "@/lib/store/supabase";
import { wrapSupabaseError } from "@/lib/supabase/errors";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const session = await resolveSession(await getSessionFromRequest(request));
  if (!session?.isAdmin || !canRestorePlanning(session.nom)) {
    return NextResponse.json(
      { error: "Seuls Jonathan et Mika peuvent restaurer une sauvegarde." },
      { status: 403 },
    );
  }
  let body: { itemId?: string; confirm?: string };
  try {
    body = (await request.json()) as { itemId?: string; confirm?: string };
  } catch {
    return NextResponse.json({ error: "Requête invalide." }, { status: 400 });
  }
  if (!body.itemId?.trim()) {
    return NextResponse.json({ error: "Choisissez une sauvegarde." }, { status: 400 });
  }
  if (body.confirm !== RESTORE_CONFIRM_PHRASE) {
    return NextResponse.json(
      { error: "Confirmation manquante. La restauration n’a pas été lancée." },
      { status: 400 },
    );
  }
  try {
    const result = await restorePlanningBackup(body.itemId.trim());
    invalidateSupabaseSnapshotCache();
    return NextResponse.json({ ok: true, restored: result.restored });
  } catch (err) {
    return NextResponse.json(
      { error: wrapSupabaseError(err).message },
      { status: 500 },
    );
  }
}
