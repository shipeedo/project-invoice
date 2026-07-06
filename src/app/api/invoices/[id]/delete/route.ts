import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { softDeleteInvoice } from "@/lib/invoice-trash";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function POST(request: Request, context: RouteContext) {
  const session = await auth();
  if (!session?.user?.organizationId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;
  const body = (await request.json().catch(() => ({}))) as { reason?: string };

  const result = await softDeleteInvoice({
    invoiceId: id,
    organizationId: session.user.organizationId,
    userId: session.user.id,
    reason: body.reason,
  });

  if ("error" in result) {
    if (result.error === "not_found") {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    if (result.error === "already_deleted") {
      return NextResponse.json({ error: "Invoice is already in trash" }, { status: 400 });
    }
  }

  return NextResponse.json(result.invoice);
}
