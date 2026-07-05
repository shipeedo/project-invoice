# Environment setup

All platform secrets are configured through **environment setup** — not in the application UI and never committed to the repo.

## Overview

| Config type | Where it lives | Examples |
|-------------|----------------|----------|
| **Platform secrets** | Environment variables (local `.env` or host secret store) | OAuth secrets, AI Gateway key, Azure app secret |
| **Per-tenancy config** | Application UI + database | O365 connection, shared mailbox, routing rules, suppliers |

---

## Local development

1. Copy the example file:

   ```bash
   cp .env.example .env
   ```

2. Fill in secret values in `.env` (gitignored).

3. Start the app — it reads env vars at runtime.

---

## Production / staging (`pi.shipeedo.com`)

Set the same variables in your **host environment** (e.g. GitHub Environment secrets, deployment platform env config, Azure Key Vault — whatever you use to run the app).

| Variable | Local value | Production value |
|----------|-------------|------------------|
| `REDIRECT_URI` | `http://localhost:3000/api/auth/callback/shipeedo` | `https://pi.shipeedo.com/api/auth/callback/shipeedo` |
| `MS_REDIRECT_URI` | `http://localhost:3000/api/auth/callback/microsoft` (if used) | `https://pi.shipeedo.com/api/auth/callback/microsoft` |

All other variables are typically the same across environments (different secret *values* if you rotate per env).

---

## Environment variables

### Shipeedo OAuth (user login)

| Variable | Secret? | Default / notes |
|----------|---------|-----------------|
| `CLIENT_ID` | No | `project-invoice` |
| `CLIENT_SECRET` | **Yes** | From Shipeedo OAuth client |
| `OIDC_ISSUER` | No | `https://auth.shipeedo.com` |
| `REDIRECT_URI` | No | Must match registered redirect URI for the environment |

Discovery: `{OIDC_ISSUER}/.well-known/openid-configuration`

See [auth.md](auth.md).

### Shipeedo tenant API (Users admin section)

| Variable | Secret? | Notes |
|----------|---------|-------|
| `TENANT_API_URL` | No | Base URL of the tenant API for `GET /api/core/user/getusers` — set in development only. In production leave unset: calls go to the app's own origin and the load balancer routes `/api` to the tenant service. |

Requests are authenticated with the signed-in admin's OIDC access token, so the tenant directory is unavailable when using mock login (`AUTH_MOCK=true`) — use "Add by email" instead.

### Microsoft Graph (Connect Office 365)

Platform-level only — powers the admin "Connect Office 365" flow for all tenancies.

| Variable | Secret? | Notes |
|----------|---------|-------|
| `MS_CLIENT_ID` | No | Multi-tenant Azure app client ID |
| `MS_CLIENT_SECRET` | **Yes** | Azure client secret |
| `MS_REDIRECT_URI` | No | OAuth callback for Microsoft connect (optional until Phase 1b) |

Customer tenant IDs, tokens, and mailbox selection are **not** env vars — configured in the UI. See [o365.md](o365.md).

### AI (invoice extraction)

When `AI_BASE_URL` is set, the app uses a local OpenAI-compatible API instead of AI Gateway.

| Variable | Secret? | Notes |
|----------|---------|-------|
| `AI_BASE_URL` | No | Local OpenAI-compatible base URL (e.g. `http://127.0.0.1:8000/v1`). When set, enables local mode. |
| `AI_API_KEY` | **Yes** | API key for local mode (required when `AI_BASE_URL` is set) |
| `AI_MODEL` | No | Model name — required in local mode; optional override for AI Gateway |
| `AI_GATEWAY_API_KEY` | **Yes** | Vercel AI Gateway key (`vck_...`) — used when `AI_BASE_URL` is not set |
| `AI_GATEWAY_URL` | No | Default: `https://ai-gateway.vercel.sh/v1/chat/completions` |
| `AI_GATEWAY_MODEL` | No | Default: `openai/gpt-4o-mini` (fallback when `AI_MODEL` is unset) |

---

## Checklist

Use this when setting up a new environment (local, staging, or production):

- [ ] `CLIENT_SECRET` — Shipeedo OAuth
- [ ] `MS_CLIENT_ID` — Azure app (public, can copy from existing env)
- [ ] `MS_CLIENT_SECRET` — Azure app
- [ ] `AI_GATEWAY_API_KEY` — AI Gateway
- [ ] `REDIRECT_URI` — matches environment (local vs production)
- [ ] `MS_REDIRECT_URI` — when O365 connect is implemented

Pre-filled in `.env.example` (no secret needed): `CLIENT_ID`, `OIDC_ISSUER`

---

## What is NOT environment setup

These are configured in the **application UI** after deploy:

- Office 365 tenant connection (admin role)
- Shared mailbox selection
- Routing rules
- Supplier records

No redeploy needed when these change.
