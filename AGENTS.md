# AGENTS.md

## Cursor Cloud specific instructions

State of the repo: greenfield. Only documentation and config exist so far
(`docs/PRD.md`, `docs/auth.md`, `docs/o365.md`, `docs/environment-setup.md`, `.env.example`,
`.gitignore`). There is **no application code, no dependency manifest, and no chosen stack yet**,
so there is nothing to lint/build/run/test. Environment setup will be picked back up after the
PRD boilerplate is scaffolded.

Platform secrets are already configured as Cloud Agent secrets and are injected as environment
variables in this environment (no need to populate `.env` for these): `CLIENT_ID`, `CLIENT_SECRET`,
`OIDC_ISSUER`, `MS_CLIENT_ID`, `MS_CLIENT_SECRET`, `AI_GATEWAY_API_KEY`. See
`docs/environment-setup.md` for what each is for. Note: `REDIRECT_URI` is intentionally **not** set
as a secret; use the documented default `http://localhost:3000/api/auth/callback/shipeedo` for local
dev (set it in `.env` or app config once the app exists).

Update script: currently a no-op because there is no dependency manifest. After the app is scaffolded,
replace it with the real install command for the chosen stack (e.g. `npm install`). The PRD/docs point
to a web app served on port `3000` with `/api/auth/...` OAuth callback routes (a Next.js + Auth.js
style setup is a natural fit, but the stack is not yet decided).
