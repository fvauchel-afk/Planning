import "server-only";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isMissingSchemaError } from "@/lib/supabase/errors";

export const PUSH_TABLE_HELP =
  "Table push_subscriptions absente. Exécutez supabase/migrations/024_push_subscriptions.sql dans l’éditeur SQL Supabase.";

export type PushSubscriptionRow = {
  id: string;
  employe_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
};

export async function upsertPushSubscription(input: {
  employeId: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  userAgent?: string;
}): Promise<{ ok: true } | { ok: false; warning: string }> {
  const supabase = createSupabaseServerClient();
  const now = new Date().toISOString();
  const { error } = await supabase.from("push_subscriptions").upsert(
    {
      employe_id: input.employeId,
      endpoint: input.endpoint,
      p256dh: input.p256dh,
      auth: input.auth,
      user_agent: input.userAgent?.slice(0, 400) || null,
      updated_at: now,
    },
    { onConflict: "endpoint" },
  );
  if (error) {
    if (isMissingSchemaError(error)) return { ok: false, warning: PUSH_TABLE_HELP };
    return { ok: false, warning: error.message };
  }
  return { ok: true };
}

export async function deletePushSubscription(endpoint: string): Promise<void> {
  const supabase = createSupabaseServerClient();
  await supabase.from("push_subscriptions").delete().eq("endpoint", endpoint);
}

export async function listPushSubscriptions(): Promise<PushSubscriptionRow[]> {
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .from("push_subscriptions")
    .select("id, employe_id, endpoint, p256dh, auth");
  if (error) {
    if (isMissingSchemaError(error)) return [];
    throw error;
  }
  return (data ?? []) as PushSubscriptionRow[];
}
