import Link from "next/link";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { CreditDraftForm } from "@/components/credit-draft-form";
import { InvoiceActions } from "@/components/invoice-actions";
import { StatusBadge } from "@/components/status-badge";
import { db } from "@/lib/db";
import { requireSession, formatCurrency, formatDate } from "@/lib/session";
import type { ExtractedLineItem } from "@/lib/extraction";

type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function InvoiceDetailPage({ params }: PageProps) {
  const session = await requireSession();
  const { id } = await params;

  const invoice = await db.invoice.findFirst({
    where: { id, organizationId: session.user.organizationId },
    include: {
      assignedTo: { select: { name: true, email: true } },
      notes: { orderBy: { createdAt: "desc" } },
      auditEvents: {
        include: { user: { select: { name: true, email: true } } },
        orderBy: { createdAt: "desc" },
      },
      creditDrafts: {
        include: { createdBy: { select: { name: true, email: true } } },
        orderBy: { createdAt: "desc" },
      },
    },
  });

  if (!invoice) {
    notFound();
  }

  const lineItems = invoice.lineItems
    ? (JSON.parse(invoice.lineItems) as ExtractedLineItem[])
    : [];

  return (
    <AppShell user={session.user}>
      <div className="space-y-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <Link href="/queue" className="text-sm text-slate-500 hover:underline">
              ← Back to queue
            </Link>
            <h2 className="mt-2 text-2xl font-semibold">
              {invoice.vendorName ?? invoice.originalFileName ?? "Invoice"}
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              Received {formatDate(invoice.createdAt)} · Assigned to{" "}
              {invoice.assignedTo?.name ?? invoice.assignedTo?.email ?? "Unassigned"}
            </p>
          </div>
          <StatusBadge status={invoice.status} />
        </div>

        {invoice.parseError ? (
          <div className="rounded-xl border border-orange-200 bg-orange-50 px-4 py-3 text-sm text-orange-900">
            Extraction issue: {invoice.parseError}
          </div>
        ) : null}

        <div className="grid gap-6 lg:grid-cols-2">
          <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <h3 className="text-base font-semibold">Extracted header</h3>
            <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
              <div>
                <dt className="text-slate-500">Vendor</dt>
                <dd className="font-medium">{invoice.vendorName ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-slate-500">Vendor email</dt>
                <dd className="font-medium">{invoice.vendorEmail ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-slate-500">Invoice number</dt>
                <dd className="font-medium">{invoice.invoiceNumber ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-slate-500">Invoice date</dt>
                <dd className="font-medium">{formatDate(invoice.invoiceDate)}</dd>
              </div>
              <div>
                <dt className="text-slate-500">Total</dt>
                <dd className="font-medium">
                  {formatCurrency(invoice.totalAmount, invoice.currency ?? "AUD")}
                </dd>
              </div>
              <div>
                <dt className="text-slate-500">Source</dt>
                <dd className="font-medium">{invoice.sourceType.toLowerCase()}</dd>
              </div>
            </dl>
          </section>

          <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <h3 className="text-base font-semibold">Source file</h3>
            <p className="mt-2 text-sm text-slate-600">{invoice.originalFileName}</p>
            <a
              href={`/api/invoices/${invoice.id}/file`}
              target="_blank"
              rel="noreferrer"
              className="mt-4 inline-flex rounded-md border border-slate-300 px-4 py-2 text-sm font-medium hover:bg-slate-100"
            >
              View PDF
            </a>
          </section>
        </div>

        <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h3 className="text-base font-semibold">Line items</h3>
          {lineItems.length === 0 ? (
            <p className="mt-3 text-sm text-slate-500">No line items extracted.</p>
          ) : (
            <div className="mt-4 overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-slate-50 text-slate-600">
                  <tr>
                    <th className="px-3 py-2 font-medium">Description</th>
                    <th className="px-3 py-2 font-medium">Qty</th>
                    <th className="px-3 py-2 font-medium">Unit</th>
                    <th className="px-3 py-2 font-medium">Amount</th>
                    <th className="px-3 py-2 font-medium">Reference</th>
                  </tr>
                </thead>
                <tbody>
                  {lineItems.map((item, index) => (
                    <tr key={`${item.description}-${index}`} className="border-t border-slate-100">
                      <td className="px-3 py-2">{item.description}</td>
                      <td className="px-3 py-2">{item.quantity ?? "—"}</td>
                      <td className="px-3 py-2">
                        {item.unitPrice != null
                          ? formatCurrency(item.unitPrice, invoice.currency ?? "AUD")
                          : "—"}
                      </td>
                      <td className="px-3 py-2">
                        {item.amount != null
                          ? formatCurrency(item.amount, invoice.currency ?? "AUD")
                          : "—"}
                      </td>
                      <td className="px-3 py-2">{item.reference ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <InvoiceActions invoiceId={invoice.id} status={invoice.status} />

        <CreditDraftForm
          invoiceId={invoice.id}
          defaultSubject={`Credit request — ${invoice.vendorName ?? invoice.originalFileName ?? "Invoice"}`}
        />

        <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h3 className="text-base font-semibold">Audit trail</h3>
          <ul className="mt-4 space-y-3 text-sm">
            {invoice.auditEvents.map((event) => (
              <li key={event.id} className="border-b border-slate-100 pb-3 last:border-0">
                <p className="font-medium">{event.action}</p>
                <p className="text-slate-500">
                  {formatDate(event.createdAt)}
                  {event.user ? ` · ${event.user.name ?? event.user.email}` : ""}
                </p>
              </li>
            ))}
          </ul>
        </section>

        {invoice.creditDrafts.length > 0 ? (
          <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <h3 className="text-base font-semibold">Credit drafts</h3>
            <ul className="mt-4 space-y-4 text-sm">
              {invoice.creditDrafts.map((draft) => (
                <li key={draft.id} className="rounded-lg border border-slate-100 p-4">
                  <p className="font-medium">{draft.subject}</p>
                  <p className="mt-2 whitespace-pre-wrap text-slate-700">{draft.message}</p>
                  <p className="mt-2 text-slate-500">
                    {formatDate(draft.createdAt)} · {draft.createdBy.name ?? draft.createdBy.email}
                  </p>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </div>
    </AppShell>
  );
}
