import { getMicrosoftClientConfig } from "@/lib/o365/config";

export type MicrosoftTokenResponse = {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  token_type: string;
  scope?: string;
  id_token?: string;
};

export function buildMicrosoftAuthorizeUrl(state: string) {
  const config = getMicrosoftClientConfig();
  if (!config) {
    throw new Error("Microsoft OAuth is not configured");
  }

  const params = new URLSearchParams({
    client_id: config.clientId,
    response_type: "code",
    redirect_uri: config.redirectUri,
    response_mode: "query",
    scope:
      "openid profile offline_access User.Read User.ReadBasic.All Mail.Read Mail.Read.Shared Mail.Send Mail.Send.Shared",
    state,
    prompt: "consent",
  });

  return `https://login.microsoftonline.com/organizations/oauth2/v2.0/authorize?${params.toString()}`;
}

export async function exchangeMicrosoftCode(code: string) {
  const config = getMicrosoftClientConfig();
  if (!config) {
    throw new Error("Microsoft OAuth is not configured");
  }

  const body = new URLSearchParams({
    client_id: config.clientId,
    client_secret: config.clientSecret,
    grant_type: "authorization_code",
    code,
    redirect_uri: config.redirectUri,
    scope:
      "openid profile offline_access User.Read User.ReadBasic.All Mail.Read Mail.Read.Shared Mail.Send Mail.Send.Shared",
  });

  const response = await fetch(
    "https://login.microsoftonline.com/organizations/oauth2/v2.0/token",
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    },
  );

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Microsoft token exchange failed (${response.status}): ${text}`);
  }

  return (await response.json()) as MicrosoftTokenResponse & {
    tenant_id?: string;
  };
}

export async function refreshMicrosoftTokens(refreshToken: string, tenantId?: string | null) {
  const config = getMicrosoftClientConfig();
  if (!config) {
    throw new Error("Microsoft OAuth is not configured");
  }

  const tokenUrl = tenantId
    ? `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`
    : "https://login.microsoftonline.com/organizations/oauth2/v2.0/token";

  const body = new URLSearchParams({
    client_id: config.clientId,
    client_secret: config.clientSecret,
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    scope:
      "openid profile offline_access User.Read User.ReadBasic.All Mail.Read Mail.Read.Shared Mail.Send Mail.Send.Shared",
  });

  const response = await fetch(tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Microsoft token refresh failed (${response.status}): ${text}`);
  }

  return (await response.json()) as MicrosoftTokenResponse;
}

export function decodeMicrosoftIdTokenTenant(idToken?: string) {
  if (!idToken) return null;
  const parts = idToken.split(".");
  if (parts.length < 2) return null;

  try {
    const payload = JSON.parse(
      Buffer.from(parts[1], "base64url").toString("utf8"),
    ) as { tid?: string };
    return payload.tid ?? null;
  } catch {
    return null;
  }
}
