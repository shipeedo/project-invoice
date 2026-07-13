import { desc, eq } from "drizzle-orm";
import { AppShell } from "@/components/app-shell";
import { CreditsTable } from "@/components/credits-table";
import { creditRequests, db } from "@/lib/db";
import { getNavCounts } from "@/lib/nav-counts";
import { requireSession } from "@/lib/session";

export default async function CreditsPage() {
  const session = await requireSession();

  const [rows, navCounts] = await Promise.all([
    db.query.creditRequests.findMany({
      where: eq(creditRequests.organizationId, session.user.organizationId),
      with: {
        invoice: {
          columns: {
            id: true,
            vendorName: true,
            invoiceNumber: true,
            originalFileName: true,
            currency: true,
          },
        },
        createdBy: { columns: { name: true, email: true } },
      },
      orderBy: desc(creditRequests.createdAt),
    }),
    getNavCounts(session.user.organizationId, session.user.id),
  ]);

  const serialized = rows.map((request) => ({
    id: request.id,
    status: request.status,
    carrierDecision: request.carrierDecision,
    subject: request.subject,
    requestedTotal: request.requestedTotal,
    approvedAmount: request.approvedAmount,
    lineItems: request.lineItems,
    createdAt: request.createdAt.toISOString(),
    invoice: request.invoice,
    createdBy: request.createdBy,
  }));

  return (
    <AppShell
      user={session.user}
      activePath="/credits"
      navCounts={navCounts}
      breadcrumbs={[{ label: "Credits" }]}
    >
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-semibold">Credit requests</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Review credit requests created from invoice line items, download spreadsheets for
            carriers, and record outcomes when credits are approved or denied.
          </p>
        </div>

        <CreditsTable creditRequests={serialized} />
      </div>
    </AppShell>
  );
}
