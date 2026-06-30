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
- Shipeedo returns `username` (not `email`) as the login identifier. The provider `profile` callback maps `username` → `email`.

## Multi-tenant support — not yet implemented

> **Status:** Pilot only. Auth works for a single hardcoded Shipeedo tenant; true multi-tenant login is **not implemented**.

### Current behaviour

- OAuth scope is fixed to `tenant:2` in `src/lib/auth.ts` — every user authenticates against that one Shipeedo tenant.
- The app data model is tenancy-aware (`organizations`, `organizationId` on users/invoices/rules), but organization records are **auto-created from OAuth claims** on first login (`tenantId`, `tenantGuid`, or email domain). There is no explicit, stable mapping from a Shipeedo tenant to an application organization.
- Production is intended to run at a **single host** (`https://pi.shipeedo.com`), but users cannot choose which customer tenant they belong to at login.

### Target (not designed yet)

Run the portal at `pi.shipeedo.com` and let the user **pick their tenant when signing in**, then complete Shipeedo OAuth scoped to that tenant.

This is **not possible with the current auth flow** because:

1. The Shipeedo OAuth `tenant:{tenantId}` scope must be set **before** redirecting to the authorization endpoint — the tenant is part of the login request, not returned only after callback.
2. There is no tenant-picker step on `/login` and no persistence of the selected tenant through the OAuth round-trip.
3. `organizations` in the database are not keyed to Shipeedo `tenantId` / `tenantGuid`; upsert logic infers org from claims or email domain.

### How ui-flexi handles it (reference)

In [ui-flexi `nextauth`](https://github.com/shipeedo/ui-flexi), tenant is resolved **before** OAuth starts (via `withTenantId` on the request — typically from subdomain or host), then the authorization scope includes `tenant:${tenantId}`. That pattern couples tenant selection to **how the user reached the app** (e.g. `{tenant}.shipeedo.com`), not to a picker on a shared `pi.shipeedo.com` host.

### Open questions / options to explore

| Approach | Notes |
|----------|-------|
| Tenant picker → OAuth | User selects tenant on `/login`; store choice in cookie/session state; build scope `tenant:{id}` before `signIn("shipeedo")`. Needs UX for users in multiple tenants. |
| Subdomain per tenant | e.g. `{tenant}.pi.shipeedo.com` — mirrors ui-flexi; may conflict with “single URL” goal. |
| Post-login tenant switch | OAuth for one tenant, then switch context — likely needs re-auth or token per tenant; unclear if Shipeedo supports this cleanly. |
| Org registry | Maintain `organizations.shipeedo_tenant_id` (or similar) and bind users strictly to the tenant in their token — reject login if token tenant ≠ selected tenant. |

**Next step:** Product/engineering decision on tenant selection UX at `pi.shipeedo.com`, then update login flow, OAuth scope construction, and organization mapping accordingly.
