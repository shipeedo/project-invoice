# Project Invoice — Product Requirements

Greenfield invoice intake, OCR, and approval system to replace email-based workflows for transport company invoices.

## Problem

Invoice handling is fragmented: email forwarding between approvers, manual notes, no shared status. Approvers (Robert, Jenny, accounts team) need a single portal to receive, review, approve, and action supplier invoices — especially from transport carriers.

## MVP Scope

**Pilot invoice types:** PDF invoices from transport companies. Emails may also include CSV attachments; the system must evaluate both and expose all source files in the portal.

**Out of scope (v1):**
- Trans Virtual integration (CRL / downgrade credits remain manual)
- Line-by-line reconciliation for high-volume invoices (e.g. TNT thousands of lines)
- Automated consignment matching against internal systems

---

## Resolved Requirements

### 1. Mailbox Integration (O365)
- **Admin role** connects Office 365 via UI ("Connect Office 365")
- Admin **selects the shared mailbox** to monitor from a picker
- Connection details (tenant, tokens, mailbox) stored **per tenancy in the database**
- Once connected, **all users in the tenancy** can access invoices from that shared mailbox

| Requirement | Detail |
|-------------|--------|
| Provider | Office 365 / Microsoft Graph |
| Configuration | **UI-driven per tenancy** — not env-based per customer |
| Connect flow | Admin OAuth consent → select shared mailbox |
| Access | All tenancy users share access to the connected mailbox's invoices |
| Platform env | `MS_CLIENT_ID`, `MS_CLIENT_SECRET` only (Shipeedo multi-tenant Azure app) |
| Trigger | On new email in selected mailbox → AI agent processes the message |
| User visibility | Raw email and all attachments viewable in the portal |

See [docs/o365.md](o365.md) for connect flow and UI requirements.

### 2. Approver Routing Rules

Routing rules are **configured in the application** (admin UI). Each rule has a **priority**; rules are evaluated in priority order — **higher priority wins**. Users can **reorder rules** in the UI to change evaluation order.

Initial rule types:

| Rule | Example |
|------|---------|
| Supplier / sender email | Invoices from `accounts@carrier.com` → User XYZ |
| Amount threshold | Total > $123,456 → User ABC |
| Parse failure | AI extraction could not complete → User ABC |

**Default (404) rule:** A catch-all routing rule assigns an approver when **no other rule matches**. This replaces ad-hoc "unknown supplier" handling — if nothing else matches, the 404 rule applies.

Rules should be extensible for additional conditions over time.

### 3. Authentication

Authentication via **Shipeedo OAuth2 / OpenID Connect**.

The OAuth server exposes **`/.well-known/openid-configuration`**. The application discovers all required endpoints (authorization, token, userinfo, JWKS, etc.) from that document — only the **issuer URL** needs to be configured, not individual endpoint URLs.

**Registered OAuth client:** `project-invoice`

| Setting | Value |
|---------|-------|
| Grant types | `authorization_code`, `refresh_token` |
| Response types | `code` |
| Local redirect URI | `http://localhost:3000/api/auth/callback/shipeedo` |
| Production redirect URI | `https://pi.shipeedo.com/api/auth/callback/shipeedo` |
| Callback route | `/api/auth/callback/shipeedo` |

See [docs/auth.md](auth.md) for full client registration details.

> **Gap:** Multi-tenant login (tenant picker at `pi.shipeedo.com`) is **not implemented** — pilot auth is scoped to a single hardcoded Shipeedo tenant. See [auth.md — Multi-tenant support](auth.md#multi-tenant-support--not-yet-implemented).

**Environment variables:**

| Variable | Required | Notes |
|----------|----------|-------|
| `CLIENT_ID` | Yes | `project-invoice` |
| `CLIENT_SECRET` | Yes | Keep private; never commit |
| `OIDC_ISSUER` | Yes | `https://auth.shipeedo.com` |
| `REDIRECT_URI` | Yes | Must match a registered redirect URI for the environment |

> **Action item (Jay):** Complete [environment setup](environment-setup.md) with `CLIENT_SECRET`.

Until environment setup is complete locally, development may use a stub/mock auth provider.

### 4. Credit Handling (MVP)

No structured credit line items in v1. When credits are needed:

- User enters a free-text message
- User attaches file(s)
- System creates a **draft email** for the user to review and send

### 5. Pilot / Invoice Types

**Pilot approach:** Start with **manually uploaded PDF invoices** from transport companies — no specific carrier list required. Sample PDFs are uploaded via the portal for testing.

**Extraction:** Use **AI Gateway** to process uploaded invoices — extract header fields (vendor, date, total, etc.) and line items. Platform API key via `AI_GATEWAY_API_KEY` env var.

**Email path (MVP, post-pilot):** Emails may include CSV attachments alongside PDFs; the system must evaluate both and expose all source files in the portal.

---

## Core Workflows

### Simple Approval (MVP primary flow)

```
PDF uploaded (pilot) or email arrives (O365)
        ↓
AI Gateway: extract header, line items, etc.
        ↓
Apply routing rules by priority → assign approver
        ↓
Approver reviews (source files, extracted data)
        ↓
Approve / Reject + notes
        ↓
Status: Ready for Payment
```

### Line-Item Review (Phase 2)

For carrier invoices requiring reconciliation:

| Action | When |
|--------|------|
| Approve | Line is correct |
| Credit — not our consignment | Billed for a shipment that isn't theirs |
| Credit — service downgrade | Express didn't meet SLA (manual Trans Virtual check) |
| Credit — not sent / no tracking | Charge exists but shipment didn't happen |
| Note | Free-text context for accounts |

---

## Invoice Status Lifecycle

```
Received → Processing → Pending Approval → Approved → Ready for Payment
                              ↓
                          Rejected / Needs Review
```

---

## Functional Requirements

### Intake
- [ ] Manual PDF upload (pilot entry point)
- [ ] Admin role: **Connect Office 365** UI (OAuth consent flow)
- [ ] Admin role: **shared mailbox picker** — select mailbox to monitor
- [ ] Store O365 connection + mailbox config per tenancy (DB)
- [ ] Poll or webhook-trigger on new email in connected mailbox
- [ ] AI agent processes email + attachments on arrival
- [ ] All tenancy users can access invoices from the connected shared mailbox
- [ ] Manual PDF/image upload for ad-hoc use

### Extraction
- [ ] AI Gateway: extract header fields and line items from PDF invoices
- [ ] Parse CSV attachments from transport carriers (email path)
- [ ] When both PDF and CSV present, evaluate both; surface conflicts if any
- [ ] Flag unparseable invoices for routing per parse-failure rule

### Portal
- [ ] View raw email content
- [ ] Download/view all attachments
- [ ] View extracted invoice data alongside source files
- [ ] Approval queue per user
- [ ] Notes and audit trail (who, when, what)

### Routing & Admin
- [ ] CRUD for suppliers (name, email domains/addresses)
- [ ] CRUD for routing rules (sender, amount, parse failure, etc.)
- [ ] Priority-based rule evaluation — higher priority wins
- [ ] Drag-and-drop or reorder UI for rule priority
- [ ] Default (404) catch-all rule — assigns approver when no other rule matches

### Auth & Tenancy
- [ ] Shipeedo OAuth login
- [ ] Role-based access: admin (O365 connect, settings), approver, user
- [ ] Tenancy-scoped data — users only see their organisation's invoices

### Office 365 (tenancy settings)
- [ ] Connect Office 365 button (admin role only)
- [ ] Display connection status
- [ ] Shared mailbox picker (list mailboxes via Graph after connect)
- [ ] Save / change selected mailbox
- [ ] Disconnect Office 365
- [ ] All tenancy users inherit access to connected mailbox invoices

### Credits (MVP)
- [ ] Compose message + attachments
- [ ] Generate draft email

---

## Non-Functional Requirements

- Greenfield codebase — no legacy dependencies
- Configurable mailbox and routing (no redeploy for rule changes where possible)
- Audit log for all status transitions and approvals

---

## Phases

| Phase | Focus |
|-------|-------|
| **1a** | PDF upload, AI Gateway extraction, routing rules (priority + 404), Shipeedo auth, simple approval, credit draft email |
| **1b** | O365 mailbox intake, CSV attachment handling, email visibility in portal |
| **2** | Line-item review actions, bulk approve for high-volume invoices |
| **3** | WMS integration, consignment matching |
| **4** | Productisation |

