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
   | `CLIENT_ID` | OAuth client ID from Shipeedo |
   | `CLIENT_SECRET` | OAuth client secret (keep private) |
   | `OIDC_ISSUER` | Issuer URL for your OAuth server |

   The app uses OpenID Connect discovery (`{OIDC_ISSUER}/.well-known/openid-configuration`) to resolve authorization, token, userinfo, and other endpoints — you do not need to configure those separately.

   Set `REDIRECT_URI` in `.env` once the app is running locally (must match the URL registered on the OAuth client).

3. For production/staging, set the same variables in your host’s secret store (e.g. GitHub Actions secrets, Azure Key Vault, etc.), not in the repo.

## Docs

- [Product Requirements (PRD)](docs/PRD.md)
