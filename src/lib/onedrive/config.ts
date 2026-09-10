import "server-only";

export type OnedriveConfig = {
  clientId: string;
  clientSecret: string;
  tenant: string;
  redirectUri: string;
  rootShareUrl: string;
};

const ROOT_SHARE_FALLBACK =
  "https://1drv.ms/f/c/75fd296b1cb875eb/IgAgqoMlPAbpR7Xo4dr94jseARPOkLdsOjJtqMkLaYV-H0o?e=eP2TI0";

function resolveTenant(raw: string | undefined): string {
  const value = (raw ?? "").trim() || "consumers";
  if (
    value === "common" ||
    value === "organizations" ||
    value === "consumers"
  ) {
    return value;
  }
  const uuid =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      value,
    );
  // Compte personnel (hotmail) : un GUID invalide casse OAuth → consumers.
  return uuid ? value : "consumers";
}

export function getOnedriveConfig(): OnedriveConfig {
  const clientId = process.env.ONEDRIVE_CLIENT_ID?.trim();
  const clientSecret = process.env.ONEDRIVE_CLIENT_SECRET?.trim();
  const redirectUri =
    process.env.ONEDRIVE_REDIRECT_URI?.trim() ||
    "http://localhost:3000/api/onedrive/callback";
  const rootShareUrl =
    process.env.ONEDRIVE_ROOT_SHARE_URL?.trim() || ROOT_SHARE_FALLBACK;
  if (!clientId || !clientSecret) {
    throw new Error(
      "OneDrive n’est pas configuré (ONEDRIVE_CLIENT_ID / ONEDRIVE_CLIENT_SECRET).",
    );
  }
  return {
    clientId,
    clientSecret,
    tenant: resolveTenant(process.env.ONEDRIVE_TENANT_ID),
    redirectUri,
    rootShareUrl,
  };
}

export const ONEDRIVE_SCOPES = [
  "offline_access",
  "Files.ReadWrite.All",
  "User.Read",
].join(" ");
