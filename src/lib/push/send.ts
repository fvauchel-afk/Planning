import "server-only";
import webpush from "web-push";
import { canReceiveCommandes } from "@/lib/auth/commande-access";
import { fetchSupabaseSnapshot } from "@/lib/store/supabase";
import {
  deletePushSubscription,
  listPushSubscriptions,
} from "@/lib/push/store";
import {
  vapidConfigured,
  vapidPrivateKey,
  vapidPublicKey,
  vapidSubject,
} from "@/lib/push/vapid";

export async function sendCommandePush(input: {
  auteur: string;
  message: string;
}): Promise<{ sent: number; warning?: string }> {
  if (!vapidConfigured()) {
    return {
      sent: 0,
      warning:
        "Clés VAPID absentes (VAPID_PUBLIC_KEY et VAPID_PRIVATE_KEY sur Vercel).",
    };
  }

  let rows;
  try {
    rows = await listPushSubscriptions();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn("[push]", message);
    return { sent: 0, warning: message };
  }
  if (rows.length === 0) return { sent: 0 };

  const snapshot = await fetchSupabaseSnapshot();
  const allowedIds = new Set(
    snapshot.employees
      .filter((employee) => canReceiveCommandes(employee.nom))
      .map((employee) => employee.id),
  );
  const targets = rows.filter((row) => allowedIds.has(row.employe_id));
  if (targets.length === 0) return { sent: 0 };

  webpush.setVapidDetails(vapidSubject(), vapidPublicKey(), vapidPrivateKey());
  const payload = JSON.stringify({
    title: "Nouvelle commande",
    body: `${input.auteur} : ${input.message.slice(0, 140)}`,
    url: "/demandes",
  });

  let sent = 0;
  await Promise.all(
    targets.map(async (row) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: row.endpoint,
            keys: { p256dh: row.p256dh, auth: row.auth },
          },
          payload,
          { TTL: 60 * 60 * 24 },
        );
        sent += 1;
      } catch (err) {
        const status =
          err && typeof err === "object" && "statusCode" in err
            ? Number((err as { statusCode: unknown }).statusCode)
            : 0;
        if (status === 404 || status === 410) {
          await deletePushSubscription(row.endpoint);
          return;
        }
        console.warn(
          "[push]",
          err instanceof Error ? err.message : String(err),
        );
      }
    }),
  );
  return { sent };
}
