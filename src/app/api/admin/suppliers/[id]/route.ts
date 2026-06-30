import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db, suppliers } from "@/lib/db";
import type { SupplierFieldMappings } from "@/lib/extraction-types";
import { parseSupplierFieldMappings } from "@/lib/extraction-types";
import { updateSupplierExtractionSettings } from "@/lib/supplier-extraction";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function PATCH(request: Request, context: RouteContext) {
  const session = await auth();
  if (!session?.user?.organizationId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await context.params;
  const body = (await request.json()) as {
    name?: string;
    emailAddresses?: string[];
    emailDomains?: string[];
    extractionPrompt?: string | null;
    fieldMappings?: SupplierFieldMappings;
  };

  const existing = await db.query.suppliers.findFirst({
    where: and(
      eq(suppliers.id, id),
      eq(suppliers.organizationId, session.user.organizationId),
    ),
  });

  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const [supplier] = await db
    .update(suppliers)
    .set({
      name: body.name?.trim(),
      emailAddresses: body.emailAddresses
        ? JSON.stringify(body.emailAddresses)
        : undefined,
      emailDomains: body.emailDomains ? JSON.stringify(body.emailDomains) : undefined,
      updatedAt: new Date(),
    })
    .where(eq(suppliers.id, id))
    .returning();

  const hasExtractionUpdates =
    body.extractionPrompt !== undefined || body.fieldMappings !== undefined;

  const updatedSupplier = hasExtractionUpdates
    ? await updateSupplierExtractionSettings({
        supplierId: id,
        organizationId: session.user.organizationId,
        extractionPrompt: body.extractionPrompt,
        fieldMappings: body.fieldMappings,
      })
    : supplier;

  if (!updatedSupplier) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({
    ...updatedSupplier,
    emailAddresses: JSON.parse(updatedSupplier.emailAddresses),
    emailDomains: JSON.parse(updatedSupplier.emailDomains),
    fieldMappings: parseSupplierFieldMappings(updatedSupplier.fieldMappings),
  });
}

export async function DELETE(_request: Request, context: RouteContext) {
  const session = await auth();
  if (!session?.user?.organizationId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await context.params;
  const existing = await db.query.suppliers.findFirst({
    where: and(
      eq(suppliers.id, id),
      eq(suppliers.organizationId, session.user.organizationId),
    ),
  });

  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await db.delete(suppliers).where(eq(suppliers.id, id));
  return NextResponse.json({ ok: true });
}
