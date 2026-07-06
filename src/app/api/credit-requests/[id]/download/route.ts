import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { parseCreditRequestLineItems } from "@/lib/credit-line-utils";
import { buildCreditSubmissionXlsxBuffer } from "@/lib/credit-submission-export";
import { creditRequests, db } from "@/lib/db";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  const session = await auth();
  if (!session?.user?.organizationId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;
  const request = await db.query.creditRequests.findFirst({
    where: and(
      eq(creditRequests.id, id),
      eq(creditRequests.organizationId, session.user.organizationId),
    ),
    with: {
      invoice: {
        columns: {
          invoiceNumber: true,
          invoiceDate: true,
          vendorName: true,
          currency: true,
        },
      },
    },
  });

  if (!request) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const lineItems = parseCreditRequestLineItems(request.lineItems);
  if (lineItems.length === 0) {
    return NextResponse.json({ error: "No line items on this credit request" }, { status: 400 });
  }

  const buffer = await buildCreditSubmissionXlsxBuffer({
    invoiceNumber: request.invoice.invoiceNumber,
    invoiceDate: request.invoice.invoiceDate,
    vendorName: request.invoice.vendorName,
    currency: request.invoice.currency,
    notes: request.notes,
    requestedTotal: request.requestedTotal,
    fuelAmount: request.fuelAmount,
    gstAmount: request.gstAmount,
    lineItems,
  });

  const fileName = `credit-request-${request.invoice.invoiceNumber ?? request.id}.xlsx`;

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${fileName}"`,
    },
  });
}
