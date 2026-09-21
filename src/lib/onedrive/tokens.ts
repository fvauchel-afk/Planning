import "server-only";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getOnedriveConfig, ONEDRIVE_SCOPES } from "@/lib/onedrive/config";
import {
  ONEDRIVE_KEEPALIVE_TTL_MS,
  onedriveAccessNeedsRefresh,
  shouldRetryOnedriveRefresh,
} from "@/lib/onedrive/reconnect";

export type OnedriveTokenRow = {
  id: string;
  access_token: string;
  refresh_token: string;
  expires_at: string;
  account_label: string | null;
  root_item_id: string | null;
  root_drive_id: string | null;
};

const ROW_ID = "default";

export async function loadOnedriveTokens(): Promise<OnedriveTokenRow | null> {
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .from("onedrive_tokens")
    .select("*")
    .eq("id", ROW_ID)
    .maybeSingle();
  if (error) throw error;
  return data as OnedriveTokenRow | null;
}

export async function saveOnedriveTokens(input: {
  access_token: string;
  refresh_token: string;
  expires_at: string;
  account_label?: string | null;
  root_item_id?: string | null;
  root_drive_id?: string | null;
}): Promise<void> {
  const supabase = createSupabaseServerClient();
  const current = await loadOnedriveTokens();
  const { error } = await supabase.from("onedrive_tokens").upsert({
    id: ROW_ID,
    access_token: input.access_token,
    refresh_token: input.refresh_token,
    expires_at: input.expires_at,
    account_label:
      input.account_label !== undefined
        ? input.account_label
        : current?.account_label ?? null,
    root_item_id:
      input.root_item_id !== undefined
        ? input.root_item_id
        : current?.root_item_id ?? null,
    root_drive_id:
      input.root_drive_id !== undefined
        ? input.root_drive_id
        : current?.root_drive_id ?? null,
    updated_at: new Date().toISOString(),
  });
  if (error) throw error;
}

export async function saveOnedriveRoot(ids: {
  root_item_id: string;
  root_drive_id: string;
}): Promise<void> {
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .from("onedrive_tokens")
    .update({
      root_item_id: ids.root_item_id,
      root_drive_id: ids.root_drive_id,
    })
    .eq("id", ROW_ID)
    .select("id")
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("OneDrive n’est pas connecté.");
}

export async function saveOnedriveAccountLabel(label: string): Promise<void> {
  const supabase = createSupabaseServerClient();
  const { error } = await supabase
    .from("onedrive_tokens")
    .update({ account_label: label })
    .eq("id", ROW_ID);
  if (error) throw error;
}

type TokenResponse = {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
};

async function requestToken(body: URLSearchParams): Promise<TokenResponse> {
  const { tenant } = getOnedriveConfig();
  const res = await fetch(
    `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    },
  );
  const json = (await res.json()) as TokenResponse & { error?: string; error_description?: string };
  if (!res.ok) {
    const raw = json.error_description || json.error || "";
    console.warn(
      "[onedrive-token]",
      json.error || res.status,
      String(raw).replace(/refresh_token=[^&\s]+/gi, "refresh_token=…").slice(0, 180),
    );
    if (/AADSTS|invalid_grant/i.test(raw)) {
      throw new Error(
        "Connexion OneDrive expirée. Ouvrez l’onglet OneDrive et cliquez sur « Connecter OneDrive ».",
      );
    }
    throw new Error(raw || "Échange de jeton Microsoft impossible.");
  }
  return json;
}

export async function exchangeAuthorizationCode(
  code: string,
  redirectUri?: string | null,
): Promise<void> {
  const cfg = getOnedriveConfig();
  const json = await requestToken(
    new URLSearchParams({
      client_id: cfg.clientId,
      client_secret: cfg.clientSecret,
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri?.trim() || cfg.redirectUri,
      scope: ONEDRIVE_SCOPES,
    }),
  );
  if (!json.refresh_token) {
    throw new Error(
      "Microsoft n’a pas renvoyé de refresh token. Vérifiez le scope offline_access.",
    );
  }
  await saveOnedriveTokens({
    access_token: json.access_token,
    refresh_token: json.refresh_token,
    expires_at: new Date(Date.now() + json.expires_in * 1000).toISOString(),
  });
}

export async function getValidAccessToken(): Promise<string> {
  const token = await refreshOnedriveAccessToken({ minTtlMs: 120_000 });
  if (!token) {
    throw new Error("OneDrive n’est pas connecté. Ouvrez /admin/onedrive.");
  }
  return token;
}

export async function refreshOnedriveAccessToken(options?: {
  minTtlMs?: number;
}): Promise<string | null> {
  return refreshOnedriveAccessTokenAttempt(options, 0);
}

async function refreshOnedriveAccessTokenAttempt(
  options: { minTtlMs?: number } | undefined,
  attempt: number,
): Promise<string | null> {
  const row = await loadOnedriveTokens();
  if (!row?.refresh_token) return null;
  const minTtlMs = options?.minTtlMs ?? 120_000;
  if (
    row.access_token &&
    !onedriveAccessNeedsRefresh(row.expires_at, Date.now(), minTtlMs)
  ) {
    return row.access_token;
  }
  const cfg = getOnedriveConfig();
  try {
    const json = await requestToken(
      new URLSearchParams({
        client_id: cfg.clientId,
        client_secret: cfg.clientSecret,
        grant_type: "refresh_token",
        refresh_token: row.refresh_token,
        scope: ONEDRIVE_SCOPES,
      }),
    );
    const refresh = json.refresh_token || row.refresh_token;
    await saveOnedriveTokens({
      access_token: json.access_token,
      refresh_token: refresh,
      expires_at: new Date(Date.now() + json.expires_in * 1000).toISOString(),
      account_label: row.account_label,
      root_item_id: row.root_item_id,
      root_drive_id: row.root_drive_id,
    });
    return json.access_token;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const fresh = await loadOnedriveTokens();
    if (
      shouldRetryOnedriveRefresh({
        attempt,
        errorMessage: message,
        previousRefreshToken: row.refresh_token,
        currentRefreshToken: fresh?.refresh_token,
        currentExpiresAt: fresh?.expires_at,
        nowMs: Date.now(),
        minTtlMs,
      })
    ) {
      return refreshOnedriveAccessTokenAttempt(options, attempt + 1);
    }
    throw err;
  }
}

/** Ne jette jamais : pour le login, sans bloquer l’employé. */
export async function refreshOnedriveQuietly(): Promise<void> {
  try {
    await refreshOnedriveAccessToken({ minTtlMs: ONEDRIVE_KEEPALIVE_TTL_MS });
  } catch (err) {
    console.warn(
      "[onedrive-keepalive]",
      err instanceof Error ? err.message : "rafraîchissement impossible",
    );
  }
}
