import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { restoreInvoice } from "@/lib/invoice-trash";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function POST(_request: Request, context: RouteContext) {
  const session = await auth();
  if (!session?.user?.organizationId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;
  const result = await restoreInvoice({
    invoiceId: id,
    organizationId: session.user.organizationId,
    userId: session.user.id,
  });

  if ("error" in result) {
    if (result.error === "not_found") {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    if (result.error === "not_deleted") {
      return NextResponse.json({ error: "Invoice is not in trash" }, { status: 400 });
    }
    if (result.error === "expired") {
      return NextResponse.json(
        { error: "This invoice is no longer available in trash" },
        { status: 410 },
      );
    }
  }

  return NextResponse.json(result.invoice);
}
