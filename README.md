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
   | `AUTH_ENDPOINT` | Shipeedo authorization URL |

   `.env` is gitignored — **do not commit secrets**. Only `.env.example` (empty placeholders) is tracked.

3. For production/staging, set the same variables in your host’s secret store (e.g. GitHub Actions secrets, Azure Key Vault, etc.), not in the repo.

## Docs

- [Product Requirements (PRD)](docs/PRD.md)
