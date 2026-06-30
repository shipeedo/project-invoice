# project-invoice

Invoice intake, OCR, and approval portal for transport company supplier invoices.

## Stack

- **Next.js 16** (App Router) on port `3000`
- **Auth.js** with Shipeedo OIDC (`/api/auth/callback/shipeedo`)
- **Prisma** + SQLite (local dev)
- **AI Gateway** for PDF extraction

## Quick start

```bash
cp .env.example .env
# Fill in secrets — see docs/environment-setup.md

npm install
npm run db:push
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

For local pilot development without Shipeedo secrets, set `AUTH_MOCK=true` in `.env` and use the mock login form on `/login`.

## Phase 1a (pilot) — implemented

- PDF upload and storage
- AI Gateway extraction (header + line items)
- Priority-based routing rules with default (404) catch-all
- Approval queue, approve / reject / ready-for-payment
- Credit request draft email composer
- Admin CRUD for routing rules and suppliers
- Tenancy-scoped data model and audit trail

## Phase 1b — not yet implemented

- Office 365 connect flow and shared mailbox intake
- CSV attachment handling from email

## Environment setup

Platform secrets (OAuth, Azure app, AI Gateway) are configured via environment variables — see **[docs/environment-setup.md](docs/environment-setup.md)**.

Per-tenancy config (O365 connection, mailbox, routing rules) is done in the application UI after deploy.

## Docs

- [Environment setup](docs/environment-setup.md)
- [Product Requirements (PRD)](docs/PRD.md)
- [Authentication (Shipeedo OAuth)](docs/auth.md)
- [Office 365 / Microsoft Graph](docs/o365.md)
