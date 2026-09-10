import "server-only";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getOnedriveConfig, ONEDRIVE_SCOPES } from "@/lib/onedrive/config";

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
  const current = await loadOnedriveTokens();
  if (!current) throw new Error("OneDrive n’est pas connecté.");
  await saveOnedriveTokens({
    access_token: current.access_token,
    refresh_token: current.refresh_token,
    expires_at: current.expires_at,
    account_label: current.account_label,
    root_item_id: ids.root_item_id,
    root_drive_id: ids.root_drive_id,
  });
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
    throw new Error(
      json.error_description || json.error || "Échange de jeton Microsoft impossible.",
    );
  }
  return json;
}

export async function exchangeAuthorizationCode(code: string): Promise<void> {
  const cfg = getOnedriveConfig();
  const json = await requestToken(
    new URLSearchParams({
      client_id: cfg.clientId,
      client_secret: cfg.clientSecret,
      grant_type: "authorization_code",
      code,
      redirect_uri: cfg.redirectUri,
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
  const row = await loadOnedriveTokens();
  if (!row) {
    throw new Error("OneDrive n’est pas connecté. Ouvrez /admin/onedrive.");
  }
  const expires = new Date(row.expires_at).getTime();
  if (expires - 120_000 > Date.now() && row.access_token) {
    return row.access_token;
  }
  const cfg = getOnedriveConfig();
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
}
