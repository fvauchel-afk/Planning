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

async function sendPushToEmployeeIds(input: {
  employeeIds: Set<string>;
  title: string;
  body: string;
  url: string;
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
  const targets = rows.filter((row) => input.employeeIds.has(row.employe_id));
  if (targets.length === 0) return { sent: 0 };

  webpush.setVapidDetails(vapidSubject(), vapidPublicKey(), vapidPrivateKey());
  const payload = JSON.stringify({
    title: input.title,
    body: input.body.slice(0, 180),
    url: input.url,
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

export async function sendPlanningAlertPush(input: {
  title: string;
  body: string;
  url: string;
}): Promise<{ sent: number; warning?: string }> {
  const snapshot = await fetchSupabaseSnapshot();
  const allowedIds = new Set(
    snapshot.employees
      .filter((employee) => canReceiveCommandes(employee.nom))
      .map((employee) => employee.id),
  );
  return sendPushToEmployeeIds({
    employeeIds: allowedIds,
    title: input.title,
    body: input.body,
    url: input.url,
  });
}

export async function sendEmployeePush(input: {
  employeeId: string;
  title: string;
  body: string;
  url: string;
}): Promise<{ sent: number; warning?: string }> {
  return sendPushToEmployeeIds({
    employeeIds: new Set([input.employeeId]),
    title: input.title,
    body: input.body,
    url: input.url,
  });
}

export async function sendCommandePush(input: {
  auteur: string;
  message: string;
}): Promise<{ sent: number; warning?: string }> {
  return sendPlanningAlertPush({
    title: "Nouvelle commande",
    body: `${input.auteur} : ${input.message.slice(0, 140)}`,
    url: "/demandes",
  });
}

export async function sendSignalementPush(input: {
  auteur: string;
  resume: string;
}): Promise<{ sent: number; warning?: string }> {
  return sendPlanningAlertPush({
    title: "Nouveau signalement",
    body: `${input.auteur} : ${input.resume}`,
    url: "/signalements",
  });
}
