# project-invoice

Invoice intake, OCR, and approval portal for transport company supplier invoices.

## Local setup

1. Copy the example env file:

   ```bash
   cp .env.example .env
   ```

2. Put your Shipeedo OAuth values in **`.env`** (repo root):

   | Variable | Description |
   |----------|-------------|
   | `CLIENT_ID` | `project-invoice` (already set in `.env.example`) |
   | `CLIENT_SECRET` | From your Shipeedo client registration |
   | `OIDC_ISSUER` | `https://auth.shipeedo.com` |
   | `REDIRECT_URI` | `http://localhost:3000/api/auth/callback/shipeedo` for local dev |

   The app uses OpenID Connect discovery (`{OIDC_ISSUER}/.well-known/openid-configuration`) to resolve authorization, token, userinfo, and other endpoints.

   See [docs/auth.md](docs/auth.md) for registered redirect URIs and OAuth client details.

3. For production (`https://pi.shipeedo.com`), set the same variables in your host’s secret store with `REDIRECT_URI=https://pi.shipeedo.com/api/auth/callback/shipeedo`.

## Docs

- [Product Requirements (PRD)](docs/PRD.md)
- [Authentication (Shipeedo OAuth)](docs/auth.md)
