# Outstanding Tasks

Track remaining work before production launch.

- [x] **Users**
- [x] **Xero/MYOB links** — Xero DownloadPdf links fetched from email body; MYOB uses PDF attachments
- [x] **Automatic invoice ingestion**
- [x] **Non-PDF attachments** — process docx, xlsx, and csv invoice files (not just PDF)
- [x] **Ignore statement emails** — account statements filtered on auto-ingestion; manual import trusts the user
- [x] **Delete invoice** — soft-delete with audit log; deleted invoices visible in Trash for 30 days and restorable
- [x] **Credits** — select line items to create credit requests, download styled spreadsheet for carriers, record approved/denied outcomes with amount
- [x] **Fix navigation** — flat sidebar with Invoices, Upload, Inbox, Trash, Credits; count badges on each item
- [x] **Credit improvements** — fuel surcharge (editable levy %, prefilled from the invoice) and GST toggles on credit requests (amounts recomputed server-side, shown in the export); credit requests allowed on paid invoices (assign/edit/approve/reject stay locked)
- [x] **Link invoice to email** — "View original email" button on the invoice source card opens a side panel with headers, attachments, rendered body, and a link to the inbox conversation; falls back to the email snapshot stored on the invoice when no mailbox message is linked
- [x] **Invoice approval** — validation view shows line items with checkboxes (all selected by default); "Confirm and route for approval" moved below the line items; deselected lines are marked rejected server-side (at least one line must stay selected)
- [x] **invoice total** — subtotal/GST/total shown under the invoice line items; extraction now persists subtotal and GST; validation view compares document totals vs totals computed from the selected lines (10% GST) and the user picks which set is saved on the invoice
- [x] **Supplier trading terms** — optional "trading terms (days)" on suppliers; when set, the invoice due date is computed as invoice date + term days, overriding the stated due date. Overrides are surfaced with an info tooltip on the invoice due date and recorded via an `invoice.due_date_overridden` audit event.
- [x] **fix create supplier** — name/email/domain fields accept free text (Base UI Autocomplete instead of Combobox); picking an inbox suggestion only fills fields left empty
- [x] **Delete supplier** — destructive button in the edit sheet with confirm dialog; linked invoices/emails are kept and unlinked (FKs are set-null)
- [x] **rip out payments** — removed the payments feature end-to-end: invoice_payments table, amount_paid/paid_at/marked_paid_by columns, PAID/PART_PAID statuses (existing rows migrated to APPROVED), the record-payment API/dialog and Payments card, and the payment audit renderers
- [ ] **Deploy to production** — in progress; handing off to 3-4 stakeholders

## Future

- [ ] **Recharges** — skipped for launch
- [ ] **Multi tenant support** - single users list - todo after auth changes 
- [ ] **Storage providers** — pluggable document storage: S3, local filesystem, Dropbox
- [ ] **More AI providers** — Azure AI Foundry and other providers alongside the current gateway connector
- [ ] **More email providers** — implement the remaining providers already listed in the app
- [ ] **Migrate to TanStack Start**
- [ ] **Migrate to Postgres** — move off SQLite/dev.db
