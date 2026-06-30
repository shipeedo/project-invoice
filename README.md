# project-invoice

Invoice intake, OCR, and approval portal for transport company supplier invoices.

## Local setup

1. Copy the example env file:

   ```bash
   cp .env.example .env
   ```

2. Fill in **`.env`** (repo root):

   **Shipeedo OAuth (user login)**

   | Variable | Description |
   |----------|-------------|
   | `CLIENT_ID` | `project-invoice` (already set in `.env.example`) |
   | `CLIENT_SECRET` | From your Shipeedo client registration |
   | `OIDC_ISSUER` | `https://auth.shipeedo.com` |
   | `REDIRECT_URI` | `http://localhost:3000/api/auth/callback/shipeedo` for local dev |

   See [docs/auth.md](docs/auth.md) for OAuth client details.

   **Platform Azure app (powers "Connect Office 365" — Phase 1b)**

   | Variable | Description |
   |----------|-------------|
   | `MS_CLIENT_ID` | Shipeedo multi-tenant Azure app client ID |
   | `MS_CLIENT_SECRET` | Azure client secret |

   Customer O365 tenants and shared mailboxes are **not** configured via env — the tenancy owner connects Office 365 and selects a mailbox in the UI. See [docs/o365.md](docs/o365.md).

3. For production (`https://pi.shipeedo.com`), set the same variables in your host’s secret store. Use `REDIRECT_URI=https://pi.shipeedo.com/api/auth/callback/shipeedo` for Shipeedo OAuth.

## Docs

- [Product Requirements (PRD)](docs/PRD.md)
- [Authentication (Shipeedo OAuth)](docs/auth.md)
- [Office 365 / Microsoft Graph](docs/o365.md)
