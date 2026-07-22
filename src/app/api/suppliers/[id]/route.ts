import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db, suppliers } from "@/lib/db";
import { updateSupplierExtractionSettings } from "@/lib/supplier-extraction";
import { mergeSuppliers } from "@/lib/supplier-merge";
import { normalizeTradingTermDays } from "@/lib/trading-terms";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function PATCH(request: Request, context: RouteContext) {
  const session = await auth();
  if (!session?.user?.organizationId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;
  const body = (await request.json()) as {
    name?: string;
    emailAddresses?: string[];
    emailDomains?: string[];
    tradingTermDays?: number | null;
    extractionPrompt?: string | null;
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
      tradingTermDays:
        body.tradingTermDays !== undefined
          ? normalizeTradingTermDays(body.tradingTermDays)
          : undefined,
      updatedAt: new Date(),
    })
    .where(eq(suppliers.id, id))
    .returning();

  const updatedSupplier =
    body.extractionPrompt !== undefined
      ? await updateSupplierExtractionSettings({
          supplierId: id,
          organizationId: session.user.organizationId,
          extractionPrompt: body.extractionPrompt,
        })
      : supplier;

  if (!updatedSupplier) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({
    ...updatedSupplier,
    emailAddresses: JSON.parse(updatedSupplier.emailAddresses),
    emailDomains: JSON.parse(updatedSupplier.emailDomains),
  });
}

export async function DELETE(request: Request, context: RouteContext) {
  const session = await auth();
  if (!session?.user?.organizationId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;

  // ?mergeInto=<id> relinks everything onto another supplier before deleting
  // this one, for cleaning up duplicates.
  const mergeIntoId = new URL(request.url).searchParams.get("mergeInto");
  if (mergeIntoId) {
    const merged = await mergeSuppliers({
      sourceId: id,
      targetId: mergeIntoId,
      organizationId: session.user.organizationId,
      userId: session.user.id,
    });

    if ("error" in merged) {
      return merged.error === "not_found"
        ? NextResponse.json({ error: "Not found" }, { status: 404 })
        : NextResponse.json(
            { error: "Choose a different supplier to merge into" },
            { status: 400 },
          );
    }

    return NextResponse.json({ ok: true, merged: merged.counts });
  }

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
