import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { changeInvoiceSupplier } from "@/lib/invoices";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function PATCH(request: Request, context: RouteContext) {
  const session = await auth();
  if (!session?.user?.organizationId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;
  const body = (await request.json()) as { supplierId?: string };

  if (!body.supplierId) {
    return NextResponse.json({ error: "Pick a supplier" }, { status: 400 });
  }

  const result = await changeInvoiceSupplier({
    organizationId: session.user.organizationId,
    userId: session.user.id,
    invoiceId: id,
    supplierId: body.supplierId,
  });

  if ("error" in result) {
    const status = result.error === "Not found" ? 404 : 400;
    return NextResponse.json({ error: result.error }, { status });
  }

  return NextResponse.json({
    supplier: { id: result.supplier.id, name: result.supplier.name },
    changed: result.changed,
  });
}
