import { NextResponse } from "next/server";
import { getSession, resolveSession } from "@/lib/auth/guard";
import { canRestorePlanning } from "@/lib/auth/restore-access";
import { canReceiveCommandes } from "@/lib/auth/commande-access";
import { canReceiveLancementAlerts } from "@/lib/auth/lancement-access";
import { isAuthTemporarilyOpen } from "@/lib/auth/temp-open-check";
import { hasSupabaseServiceRole } from "@/lib/supabase/server";

export async function GET() {
  const authTemporarilyOpen = isAuthTemporarilyOpen();
  const session = await resolveSession(await getSession());
  if (!session) {
    return NextResponse.json(
      { user: null, authTemporarilyOpen },
      { status: 401 },
    );
  }
  return NextResponse.json({
    user: {
      employeeId: session.employeeId,
      nom: session.nom,
      isAdmin: session.isAdmin,
      canRestore: canRestorePlanning(session.nom),
      canReceiveCommandes: canReceiveCommandes(session.nom),
      canReceiveLancementAlerts: canReceiveLancementAlerts(session.nom),
    },
    authTemporarilyOpen,
    hasServiceRole: hasSupabaseServiceRole(),
  });
}
