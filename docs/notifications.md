# Notifications (planned)

This document describes the notification events the invoice approval system should emit. **Notifications are not implemented yet** — this is a design reference for a future phase.

## Overview

Notifications inform users when action is required or when system events affect their queue. They complement the due date, response due, and escalation features already in the app.

Delivery channels to consider:

| Channel | Use case |
|---------|----------|
| Email | Primary for approvers who do not live in the app daily |
| In-app | Badge counts and a notification centre in the sidebar |
| Microsoft Teams / Slack | Optional future integration for enterprise tenants |

## Events

### 1. Invoice assigned (`invoice.routed`)

**Trigger:** An invoice is validated, routed to an approver, and enters `PENDING_APPROVAL`.

**Recipient:** The assigned approver (`assignedToId`).

**Payload:**

- Invoice ID, vendor name, total amount, currency
- Invoice due date (`dueDate`)
- Response due date (`responseDueAt`) and the rule that produced it
- Link to `/invoices/{id}`

**When to send:** Immediately after routing in `validateInvoice` (`src/lib/invoices.ts`).

---

### 2. Response due approaching (`invoice.response_due_soon`)

**Trigger:** Scheduled job finds invoices where `responseDueAt` is within N days (e.g. 1 day) and status is still `PENDING_APPROVAL` or `NEEDS_REVIEW`.

**Recipient:** Assigned approver.

**Payload:** Same as assignment, plus days remaining.

**Suggested schedule:** Daily cron, similar to `/api/cron/escalate`.

---

### 3. Response due overdue (`invoice.response_due_overdue`)

**Trigger:** `responseDueAt < now` and invoice still awaiting outcome.

**Recipient:** Assigned approver; optionally CC org admins.

**Payload:** Invoice summary + overdue duration.

---

### 4. Invoice escalated (`invoice.escalated`)

**Trigger:** Escalation job reassigns an invoice (`src/lib/escalation.ts`).

**Recipients:**

- New assignee (`escalateToUserId`) — primary
- Previous assignee — informational (“invoice moved to …”)

**Payload:**

- Invoice summary
- Days idle before escalation
- Escalation rule name
- Link to invoice

**Integration point:** Call notification helper at the end of `processEscalationsForOrganization` after `recordAuditEvent`.

---

### 5. Invoice payment due soon / overdue (optional)

**Trigger:** `dueDate` within N days or in the past, while invoice is not yet `READY_FOR_PAYMENT` or `REJECTED`.

**Recipient:** Assigned approver or finance distribution list (org setting).

Distinct from **response due** — this is about paying the supplier, not allocating an approval outcome.

## Data model (proposed)

```ts
notifications {
  id
  organizationId
  userId              // recipient
  invoiceId           // optional
  type                // e.g. INVOICE_ASSIGNED, RESPONSE_DUE_SOON, ESCALATED
  title
  body
  readAt              // null = unread
  createdAt
}

notification_preferences {
  userId
  eventType
  emailEnabled
  inAppEnabled
}
```

Alternatively, derive pending notifications from `audit_events` + invoice state without a dedicated table for the first iteration.

## Implementation sketch

### Phase A — In-app only

1. Add `notifications` table and `GET /api/notifications` + `PATCH .../read`.
2. Emit rows from existing hooks:
   - After `invoice.routed` in `validateInvoice`
   - After `invoice.escalated` in `escalation.ts`
3. Sidebar bell icon with unread count.

### Phase B — Email

1. Choose provider (Resend, SendGrid, or Microsoft Graph for O365 tenants).
2. Add `NOTIFICATION_EMAIL_FROM` env var; templates per event type.
3. Daily cron routes:
   - `/api/cron/escalate` (existing)
   - `/api/cron/response-due-reminders` (new)
4. Respect `notification_preferences` per user.

### Phase C — Digest mode

Batch “3 invoices need your attention” emails instead of one email per event.

## Cron schedule (suggested)

| Job | Frequency | Route |
|-----|-----------|-------|
| Escalation | Daily 06:00 UTC | `GET /api/cron/escalate` |
| Response due reminders | Daily 07:00 UTC | `GET /api/cron/response-due-reminders` (future) |
| Payment due reminders | Daily 07:00 UTC | `GET /api/cron/payment-due-reminders` (future) |

Secure all cron routes with `Authorization: Bearer ${CRON_SECRET}` (see `src/app/api/cron/escalate/route.ts`).

## Related code

| Concern | Location |
|---------|----------|
| Response due computation | `src/lib/response-due.ts` |
| Escalation processing | `src/lib/escalation.ts` |
| Invoice routing | `src/lib/invoices.ts` → `validateInvoice` |
| Admin rule configuration | `/admin/response-due-rules`, `/admin/escalation-rules` |
| Audit trail | `src/lib/audit.ts` — all notification-worthy events are already logged |

## Open questions

1. Should the original approver be notified when an invoice is escalated away from them?
2. Should response due reminders repeat daily until actioned, or fire once?
3. Per-org vs per-user timezone for “due by end of day” semantics?
4. When O365 mailbox intake ships (Phase 1b), should assignment emails reply-to the intake mailbox?
