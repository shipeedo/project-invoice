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

### 1. Mailbox Integration

| Requirement | Detail |
|-------------|--------|
| Provider | Office 365 |
| Mailbox | Shared temporary mailbox; **must be configurable in the application** (not hardcoded) |
| Trigger | On new email arrival, start an AI agent to process the message |
| Agent behaviour | Find attachments, extract supplier invoice data |
| User visibility | Raw email and all attachments must be viewable in the portal |

### 2. Approver Routing Rules

Routing rules are **configured in the application** (admin UI or config). Initial rule types:

| Rule | Example |
|------|---------|
| Supplier / sender email | Invoices from `accounts@carrier.com` → User XYZ |
| Amount threshold | Total > $123,456 → User ABC |
| Parse failure | OCR/parsing could not complete → User ABC |
| Unknown supplier | No matching supplier record → User XYZ |

Rules should be extensible; evaluation order TBD at implementation.

### 3. Authentication

Authentication via **Shipeedo OAuth server**.

> **Action item (Jay):** Register an OAuth client in Shipeedo and provide `client_id` + `client_secret` to the project.

Until credentials are available, development may use a stub/mock auth provider.

### 4. Credit Handling (MVP)

No structured credit line items in v1. When credits are needed:

- User enters a free-text message
- User attaches file(s)
- System creates a **draft email** for the user to review and send

### 5. Pilot Vendor / Invoice Types

- Primary: **PDF invoices from transport companies**
- Secondary: **CSV attachments** in the same email — both PDF and CSV must be processed/evaluated
- Portal must give users access to all source attachments and extracted data

---

## Core Workflows

### Simple Approval (MVP primary flow)

```
Email arrives (O365) or manual upload
        ↓
AI agent: extract attachments, OCR invoice data
        ↓
Apply routing rules → assign approver
        ↓
Approver reviews (raw email, attachments, extracted data)
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
- [ ] Configure O365 shared mailbox connection in app
- [ ] Poll or webhook-trigger on new email (implementation TBD)
- [ ] AI agent processes email + attachments on arrival
- [ ] Manual PDF/image upload as fallback

### Extraction
- [ ] OCR PDF invoices (vendor, date, total, line items where feasible)
- [ ] Parse CSV attachments from transport carriers
- [ ] When both PDF and CSV present, evaluate both; surface conflicts if any
- [ ] Flag unparseable invoices for routing per rules

### Portal
- [ ] View raw email content
- [ ] Download/view all attachments
- [ ] View extracted invoice data alongside source files
- [ ] Approval queue per user
- [ ] Notes and audit trail (who, when, what)

### Routing & Admin
- [ ] CRUD for suppliers (name, email domains/addresses)
- [ ] CRUD for routing rules (sender, amount, parse failure, unknown supplier)
- [ ] Assign approver on match; fallback rule for unmatched

### Auth
- [ ] Shipeedo OAuth login
- [ ] Role-based access (approver, admin) — detail TBD

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
| **1 — MVP** | O365 intake, OCR/PDF+CSV, routing rules, Shipeedo auth, simple approval, credit draft email |
| **2** | Line-item review actions, bulk approve for high-volume invoices |
| **3** | WMS integration, consignment matching, productisation |

---

## Open Items

| Item | Owner | Status |
|------|-------|--------|
| Shipeedo OAuth client + secret | Jay | **Pending** |
| O365 shared mailbox credentials / app registration | Jay | TBD |
| Routing rule evaluation order | Team | TBD at implementation |
| Specific pilot transport carriers | Team | TBD |
