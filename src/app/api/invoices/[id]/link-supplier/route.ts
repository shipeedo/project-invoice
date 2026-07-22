import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { linkInvoiceSupplier } from "@/lib/invoices";

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
    vendorName: string;
    vendorEmail?: string | null;
    supplierId?: string;
    createSupplier?: boolean;
  };

  const result = await linkInvoiceSupplier({
    organizationId: session.user.organizationId,
    userId: session.user.id,
    invoiceId: id,
    vendorName: body.vendorName,
    vendorEmail: body.vendorEmail,
    supplierId: body.supplierId,
    createSupplier: body.createSupplier,
  });

  if ("error" in result) {
    const status = result.error === "Not found" ? 404 : 400;
    return NextResponse.json({ error: result.error }, { status });
  }

  return NextResponse.json({
    supplier: { id: result.supplier.id, name: result.supplier.name },
    created: result.created,
  });
}
