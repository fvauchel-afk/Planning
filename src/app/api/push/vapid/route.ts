import { NextResponse } from "next/server";
import { getSession, resolveSession, unauthorized } from "@/lib/auth/guard";
import { canReceiveCommandes } from "@/lib/auth/commande-access";
import { vapidPublicKey } from "@/lib/push/vapid";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const session = await resolveSession(await getSession());
  if (!session) return unauthorized();
  if (!canReceiveCommandes(session.nom)) {
    return NextResponse.json({ publicKey: null });
  }
  const publicKey = vapidPublicKey();
  return NextResponse.json({ publicKey: publicKey || null });
}
