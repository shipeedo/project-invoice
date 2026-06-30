import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { StatusBadge } from "@/components/status-badge";
import { db } from "@/lib/db";
import { requireSession, formatCurrency, formatDate } from "@/lib/session";

export default async function QueuePage() {
  const session = await requireSession();

  const invoices = await db.invoice.findMany({
    where: { organizationId: session.user.organizationId },
    include: {
      assignedTo: { select: { name: true, email: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  const myQueue = invoices.filter(
    (invoice) =>
      invoice.assignedToId === session.user.id ||
      ["PENDING_APPROVAL", "NEEDS_REVIEW"].includes(invoice.status),
  );

  return (
    <AppShell user={session.user}>
      <div className="space-y-6">
        <div className="flex items-end justify-between gap-4">
          <div>
            <h2 className="text-2xl font-semibold">Approval queue</h2>
            <p className="mt-1 text-sm text-slate-600">
              Tenancy-scoped invoices from uploads and future mailbox intake.
            </p>
          </div>
          <Link
            href="/upload"
            className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
          >
            Upload invoice
          </Link>
        </div>

        <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 px-4 py-3">
            <h3 className="font-medium">All invoices ({invoices.length})</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-slate-50 text-slate-600">
                <tr>
                  <th className="px-4 py-3 font-medium">Vendor</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Total</th>
                  <th className="px-4 py-3 font-medium">Assigned to</th>
                  <th className="px-4 py-3 font-medium">Received</th>
                </tr>
              </thead>
              <tbody>
                {invoices.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-slate-500">
                      No invoices yet. Upload a PDF to start the pilot flow.
                    </td>
                  </tr>
                ) : (
                  invoices.map((invoice) => (
                    <tr key={invoice.id} className="border-t border-slate-100 hover:bg-slate-50">
                      <td className="px-4 py-3">
                        <Link href={`/invoices/${invoice.id}`} className="font-medium hover:underline">
                          {invoice.vendorName ?? invoice.originalFileName ?? "Unknown vendor"}
                        </Link>
                        {invoice.parseError ? (
                          <p className="text-xs text-orange-700">Parse issue: {invoice.parseError}</p>
                        ) : null}
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge status={invoice.status} />
                      </td>
                      <td className="px-4 py-3">
                        {formatCurrency(invoice.totalAmount, invoice.currency ?? "AUD")}
                      </td>
                      <td className="px-4 py-3">
                        {invoice.assignedTo?.name ?? invoice.assignedTo?.email ?? "Unassigned"}
                      </td>
                      <td className="px-4 py-3">{formatDate(invoice.createdAt)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <h3 className="font-medium">My queue ({myQueue.length})</h3>
          <ul className="mt-3 space-y-2 text-sm">
            {myQueue.length === 0 ? (
              <li className="text-slate-500">Nothing assigned to you right now.</li>
            ) : (
              myQueue.map((invoice) => (
                <li key={invoice.id}>
                  <Link href={`/invoices/${invoice.id}`} className="hover:underline">
                    {invoice.vendorName ?? invoice.originalFileName} — {invoice.status.toLowerCase().replaceAll("_", " ")}
                  </Link>
                </li>
              ))
            )}
          </ul>
        </section>
      </div>
    </AppShell>
  );
}
