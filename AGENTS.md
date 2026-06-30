# AGENTS.md

## Cursor Cloud specific instructions

The app is a **Next.js 16** project in the repo root (`package.json`, `src/`, `prisma/`).

### Dev server

```bash
npm run dev   # http://localhost:3000
```

### Database

SQLite for local dev (`DATABASE_URL="file:./dev.db"` in `.env`). After schema changes:

```bash
npm run db:push
```

### Auth

- Production: Shipeedo OIDC via Auth.js (`CLIENT_ID`, `CLIENT_SECRET`, `OIDC_ISSUER`, `REDIRECT_URI`, `AUTH_SECRET`)
- Local pilot without secrets: set `AUTH_MOCK=true` and use the mock login form

Callback route: `http://localhost:3000/api/auth/callback/shipeedo`

### Platform secrets

Injected as Cloud Agent secrets (no need to populate `.env` for these in cloud): `CLIENT_ID`, `CLIENT_SECRET`, `OIDC_ISSUER`, `MS_CLIENT_ID`, `MS_CLIENT_SECRET`, `AI_GATEWAY_API_KEY`. See `docs/environment-setup.md`.

Also required at runtime: `AUTH_SECRET`, `DATABASE_URL`, `REDIRECT_URI`.

### Update script

```bash
npm install
npm run db:push
```

### Lint / build / test

```bash
npm run lint
npm run build
```

There are no automated tests yet.

### Phase scope

- **1a (pilot):** PDF upload, AI extraction, routing, approval, credit drafts — implemented
- **1b:** O365 mailbox intake — not yet implemented
