import { NextRequest, NextResponse } from "next/server";
import { getSession, resolveSession, unauthorized } from "@/lib/auth/guard";
import {
  deletePushSubscription,
  upsertPushSubscription,
} from "@/lib/push/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Body = {
  endpoint?: string;
  keys?: { p256dh?: string; auth?: string };
};

export async function POST(request: NextRequest) {
  const session = await resolveSession(await getSession());
  if (!session) return unauthorized();
  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Requête invalide." }, { status: 400 });
  }
  const endpoint = body.endpoint?.trim() ?? "";
  const p256dh = body.keys?.p256dh?.trim() ?? "";
  const auth = body.keys?.auth?.trim() ?? "";
  if (!endpoint || !p256dh || !auth) {
    return NextResponse.json({ error: "Abonnement incomplet." }, { status: 400 });
  }
  const result = await upsertPushSubscription({
    employeId: session.employeeId,
    endpoint,
    p256dh,
    auth,
    userAgent: request.headers.get("user-agent") ?? undefined,
  });
  if (!result.ok) {
    return NextResponse.json({ error: result.warning }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: NextRequest) {
  const session = await resolveSession(await getSession());
  if (!session) return unauthorized();
  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Requête invalide." }, { status: 400 });
  }
  const endpoint = body.endpoint?.trim() ?? "";
  if (endpoint) await deletePushSubscription(endpoint);
  return NextResponse.json({ ok: true });
}
