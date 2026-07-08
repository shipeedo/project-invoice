import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { createCreditRequest, parseCreateCreditLinesInput } from "@/lib/credit-lines";
import { db, invoices } from "@/lib/db";
import { invoiceNotDeleted } from "@/lib/invoice-trash";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function POST(request: Request, context: RouteContext) {
  const session = await auth();
  if (!session?.user?.organizationId || !session.user.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;
  const invoice = await db.query.invoices.findFirst({
    where: and(
      eq(invoices.id, id),
      eq(invoices.organizationId, session.user.organizationId),
      invoiceNotDeleted(),
    ),
  });

  if (!invoice) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = (await request.json()) as {
    lines?: unknown;
    includeGst?: boolean;
    requestedTotal?: number | null;
    notes?: string | null;
  };

  const lines = parseCreateCreditLinesInput(body.lines);
  if (!lines) {
    return NextResponse.json(
      { error: "Each credit line needs a description, amount, and reason" },
      { status: 400 },
    );
  }

  const outcome = await createCreditRequest({
    organizationId: session.user.organizationId,
    userId: session.user.id,
    invoiceId: id,
    lines,
    includeGst: body.includeGst === true,
    requestedTotal: body.requestedTotal,
    notes: body.notes,
  });

  if ("error" in outcome) {
    return NextResponse.json({ error: outcome.error }, { status: 400 });
  }

  return NextResponse.json(outcome.creditRequest, { status: 201 });
}
