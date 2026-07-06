import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import {
  createCreditRequestFromLines,
  parseCreateCreditLinesInput,
} from "@/lib/credit-lines";
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
    includeFuel?: boolean;
    fuelRate?: number | null;
    includeGst?: boolean;
    requestedTotal?: number | null;
    notes?: string | null;
  };

  // Fuel rate arrives as a fraction (0.1039 = 10.39%); anything outside
  // (0, 1] is discarded so the invoice-derived rate applies instead.
  const fuelRate =
    typeof body.fuelRate === "number" &&
    Number.isFinite(body.fuelRate) &&
    body.fuelRate > 0 &&
    body.fuelRate <= 1
      ? body.fuelRate
      : null;

  const lines = parseCreateCreditLinesInput(body.lines);
  if (!lines) {
    return NextResponse.json({ error: "Each line needs a valid reason" }, { status: 400 });
  }

  const outcome = await createCreditRequestFromLines({
    organizationId: session.user.organizationId,
    userId: session.user.id,
    invoiceId: id,
    lines,
    includeFuel: body.includeFuel === true,
    fuelRate,
    includeGst: body.includeGst === true,
    requestedTotal: body.requestedTotal,
    notes: body.notes,
  });

  if ("error" in outcome) {
    return NextResponse.json({ error: outcome.error }, { status: 400 });
  }

  return NextResponse.json(outcome.creditRequest, { status: 201 });
}
