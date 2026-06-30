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

Discovery URL: `https://auth.shipeedo.com/.well-known/openid-configuration`

## Environment variables

See [environment-setup.md](environment-setup.md) for platform env configuration.

## Implementation notes

- Use **authorization code** flow with **PKCE** (recommended for web apps even with a client secret).
- Persist and use **refresh tokens** (`refresh_token` grant is enabled on the client).
- Callback route: `/api/auth/callback/shipeedo`
