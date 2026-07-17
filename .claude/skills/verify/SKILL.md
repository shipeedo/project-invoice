---
name: verify
description: Verify changes end-to-end by driving the app in a browser against a production build on :4123 with mock auth.
---

# Verify project-invoice changes

Jay's `next dev` owns :3000 — never start a second server there. Verify against
a prod build on :4123.

## Launch

```bash
pnpm build
# Kill any leftover verify server first — a stale one causes silent EADDRINUSE
# and you end up driving old code (it may even redirect to pi.shipeedo.com):
lsof -nP -iTCP:4123 -sTCP:LISTEN -t | xargs kill
AUTH_MOCK=true PORT=4123 pnpm start
```

## Auth

`AUTH_MOCK=true` enables a mock login form at `/login`. To log in as a specific
existing user (the form UI can be flaky through automation), post directly:

```js
const fd = new FormData();
fd.set('email', 'j.baker@shipeedo.com'); // must match a users row to get their data
fd.set('name', 'Jay Baker');
fd.set('role', 'ADMIN');
fd.set('callbackUrl', '/queue');
await fetch('/api/auth/mock-login', { method: 'POST', body: fd });
```

Users and fixture data live in the shared `dev.db` — query it read-only
(`sqlite3 "file:dev.db?mode=ro"`) to pick test invoices/users. Never write to
it from verify scripts.

## Driving

Use the t3-code preview browser at `http://127.0.0.1:4123` (not `localhost` —
DNS can die mid-session; dev :3000 won't hydrate there). `preview_snapshot`
and `preview_resize` time out in this environment — drive and capture with
`preview_evaluate` DOM queries instead. base-ui menus ignore synthetic events;
prefer real `element.click()` on the actual buttons.

Kill the :4123 server when done so the next session doesn't inherit a stale
build.
