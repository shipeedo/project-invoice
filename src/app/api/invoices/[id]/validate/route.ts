import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { validateInvoice } from "@/lib/invoices";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function POST(request: Request, context: RouteContext) {
  const session = await auth();
  if (!session?.user?.organizationId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;
  const body = (await request.json()) as {
    fields: {
      vendorName: string;
      vendorEmail?: string | null;
      invoiceNumber?: string | null;
      invoiceDate?: string | null;
      dueDate?: string | null;
      respondByDate?: string | null;
      totalAmount?: number | null;
      subtotalAmount?: number | null;
      taxAmount?: number | null;
      currency?: string;
    };
    supplierId?: string | null;
    createSupplier?: {
      name: string;
      emailAddresses?: string[];
      emailDomains?: string[];
    };
  };

  const result = await validateInvoice({
    organizationId: session.user.organizationId,
    userId: session.user.id,
    invoiceId: id,
    fields: body.fields,
    supplierId: body.supplierId,
    createSupplier: body.createSupplier,
  });

  if ("error" in result) {
    const status = result.error === "Not found" ? 404 : 400;
    return NextResponse.json({ error: result.error }, { status });
  }

  return NextResponse.json(result.invoice);
}
