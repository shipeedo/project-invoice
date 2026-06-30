# Authentication (Shipeedo OAuth)

## Registered OAuth client

| Field | Value |
|-------|-------|
| Client ID | `project-invoice` |
| Grant types | `authorization_code`, `refresh_token` |
| Response types | `code` |
| Require consent | `false` |
| Allow silent login | `true` |

## Redirect URIs (registered)

| Environment | URI |
|-------------|-----|
| Local | `http://localhost:3000/api/auth/callback/shipeedo` |
| Local (wildcard subdomains) | `http://*.localhost:3000/api/auth/callback/shipeedo` |
| Production | `https://pi.shipeedo.com/api/auth/callback/shipeedo` |

Local dev should use the plain `localhost` URI unless you intentionally need a subdomain.

## OpenID Connect discovery

The Shipeedo OAuth server exposes:

```
{OIDC_ISSUER}/.well-known/openid-configuration
```

The application uses that document to resolve `authorization_endpoint`, `token_endpoint`, `userinfo_endpoint`, `jwks_uri`, and other endpoints. Do not hardcode individual endpoint URLs.

## Environment variables

See [`.env.example`](../.env.example). Required values:

| Variable | Notes |
|----------|-------|
| `CLIENT_ID` | `project-invoice` (public) |
| `CLIENT_SECRET` | From Shipeedo client registration — **never commit** |
| `OIDC_ISSUER` | Base issuer URL for discovery |
| `REDIRECT_URI` | Must exactly match a registered redirect URI for the environment |

## Implementation notes

- Use **authorization code** flow with **PKCE** (recommended for web apps even with a client secret).
- Persist and use **refresh tokens** (`refresh_token` grant is enabled on the client).
- Callback route: `/api/auth/callback/shipeedo`
