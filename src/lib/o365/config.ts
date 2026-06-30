export const MICROSOFT_AUTHORIZE_URL =
  "https://login.microsoftonline.com/organizations/oauth2/v2.0/authorize";

export const MICROSOFT_SCOPES = [
  "openid",
  "profile",
  "offline_access",
  "User.Read",
  "Mail.Read",
  "Mail.Read.Shared",
  "Mail.Send",
  "Mail.Send.Shared",
].join(" ");

export function getMicrosoftRedirectUri() {
  return (
    process.env.MS_REDIRECT_URI ??
    `${process.env.NEXTAUTH_URL ?? "http://localhost:3000"}/api/o365/callback`
  );
}

export function getMicrosoftClientConfig() {
  const clientId = process.env.MS_CLIENT_ID;
  const clientSecret = process.env.MS_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    return null;
  }

  return {
    clientId,
    clientSecret,
    redirectUri: getMicrosoftRedirectUri(),
  };
}

export function isO365Configured() {
  return getMicrosoftClientConfig() !== null;
}
