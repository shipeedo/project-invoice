import { beforeEach, describe, expect, it } from "vitest";
import { db, invoices, organizations, suppliers } from "@/lib/db";
import { findDuplicateSupplierInvoice } from "@/lib/o365/invoice-duplicates";

const ORG = "org-dupes";
const OTHER_ORG = "org-other";

async function seedInvoice(values: {
  id: string;
  organizationId?: string;
  supplierId?: string | null;
  vendorName?: string | null;
  invoiceNumber?: string | null;
  totalAmount?: number | null;
  invoiceDate?: Date | null;
  deletedAt?: Date | null;
}) {
  const now = new Date();
  await db.insert(invoices).values({
    id: values.id,
    organizationId: values.organizationId ?? ORG,
    supplierId: values.supplierId ?? null,
    vendorName: values.vendorName ?? null,
    invoiceNumber: values.invoiceNumber ?? null,
    totalAmount: values.totalAmount ?? null,
    invoiceDate: values.invoiceDate ?? null,
    deletedAt: values.deletedAt ?? null,
    createdAt: now,
    updatedAt: now,
  });
}

beforeEach(async () => {
  await db.delete(invoices);
  await db.delete(suppliers);
  await db.delete(organizations);
  const now = new Date();
  await db.insert(organizations).values([
    { id: ORG, name: "Dupes Co", slug: "dupes-co", createdAt: now, updatedAt: now },
    { id: OTHER_ORG, name: "Other Co", slug: "other-co", createdAt: now, updatedAt: now },
  ]);
});

describe("findDuplicateSupplierInvoice", () => {
  it("matches on invoice number and total even when no supplier resolved", async () => {
    // The regression this whole change exists for: both copies have a null
    // supplier_id, which the old supplier-scoped check skipped entirely.
    await seedInvoice({ id: "inv-1", invoiceNumber: "INV-NB29", totalAmount: 4667.58 });

    const found = await findDuplicateSupplierInvoice({
      organizationId: ORG,
      invoiceNumber: "INV-NB29",
      totalAmount: 4667.58,
    });

    expect(found?.id).toBe("inv-1");
  });

  it("matches when only one copy has a supplier linked", async () => {
    await seedInvoice({
      id: "inv-1",
      supplierId: null,
      invoiceNumber: "INV-1149",
      totalAmount: 302.61,
    });

    const found = await findDuplicateSupplierInvoice({
      organizationId: ORG,
      invoiceNumber: "INV-1149",
      totalAmount: 302.61,
    });

    expect(found?.id).toBe("inv-1");
  });

  it("ignores case and surrounding whitespace on the invoice number", async () => {
    await seedInvoice({ id: "inv-1", invoiceNumber: " inv-7037 ", totalAmount: 5009.95 });

    const found = await findDuplicateSupplierInvoice({
      organizationId: ORG,
      invoiceNumber: "INV-7037",
      totalAmount: 5009.95,
    });

    expect(found?.id).toBe("inv-1");
  });

  it("does not match when the total differs", async () => {
    await seedInvoice({ id: "inv-1", invoiceNumber: "INV-500", totalAmount: 100 });

    const found = await findDuplicateSupplierInvoice({
      organizationId: ORG,
      invoiceNumber: "INV-500",
      totalAmount: 150,
    });

    expect(found).toBeNull();
  });

  it("falls back to total plus invoice date when the number did not extract", async () => {
    const invoiceDate = new Date("2026-05-01T00:00:00.000Z");
    await seedInvoice({
      id: "inv-1",
      invoiceNumber: null,
      vendorName: "Ausfast Couriers",
      totalAmount: 80.54,
      invoiceDate,
    });

    const found = await findDuplicateSupplierInvoice({
      organizationId: ORG,
      invoiceNumber: null,
      totalAmount: 80.54,
      invoiceDate,
    });

    expect(found?.id).toBe("inv-1");
  });

  it("imports an invoice whose number did not match, even if total+date collide", async () => {
    // The total+date rule is not vendor-scoped, so two unrelated suppliers
    // billing the same amount on the same day would collide. Gating it on a
    // missing invoice number keeps that collision from silently dropping a
    // genuinely new invoice that carries its own number.
    const invoiceDate = new Date("2026-05-01T00:00:00.000Z");
    await seedInvoice({
      id: "inv-1",
      invoiceNumber: "INV-500",
      vendorName: "Ausfast Couriers",
      totalAmount: 95.84,
      invoiceDate,
    });

    const found = await findDuplicateSupplierInvoice({
      organizationId: ORG,
      invoiceNumber: "INV-501",
      totalAmount: 95.84,
      invoiceDate,
    });

    expect(found).toBeNull();
  });

  it("applies the total+date rule regardless of vendor name", async () => {
    // Still not vendor-scoped when no number extracted: two unrelated suppliers
    // billing the same amount on the same day collide and the second is
    // skipped. Change this test if that behaviour is ever tightened.
    const invoiceDate = new Date("2026-05-01T00:00:00.000Z");
    await seedInvoice({
      id: "inv-1",
      invoiceNumber: null,
      vendorName: "Ausfast Couriers",
      totalAmount: 95.84,
      invoiceDate,
    });

    const found = await findDuplicateSupplierInvoice({
      organizationId: ORG,
      invoiceNumber: null,
      totalAmount: 95.84,
      invoiceDate,
    });

    expect(found?.id).toBe("inv-1");
  });

  it("prefers the number+total match over the total+date match", async () => {
    const invoiceDate = new Date("2026-05-01T00:00:00.000Z");
    await seedInvoice({ id: "by-date", invoiceNumber: null, totalAmount: 500, invoiceDate });
    await seedInvoice({ id: "by-number", invoiceNumber: "INV-77", totalAmount: 500 });

    const found = await findDuplicateSupplierInvoice({
      organizationId: ORG,
      invoiceNumber: "INV-77",
      totalAmount: 500,
      invoiceDate,
    });

    expect(found?.id).toBe("by-number");
  });

  it("does not match across organizations", async () => {
    await seedInvoice({
      id: "inv-1",
      organizationId: OTHER_ORG,
      invoiceNumber: "INV-900",
      totalAmount: 42,
    });

    const found = await findDuplicateSupplierInvoice({
      organizationId: ORG,
      invoiceNumber: "INV-900",
      totalAmount: 42,
    });

    expect(found).toBeNull();
  });

  it("ignores soft-deleted invoices so a trashed one can be re-imported", async () => {
    await seedInvoice({
      id: "inv-1",
      invoiceNumber: "INV-901",
      totalAmount: 42,
      deletedAt: new Date(),
    });

    const found = await findDuplicateSupplierInvoice({
      organizationId: ORG,
      invoiceNumber: "INV-901",
      totalAmount: 42,
    });

    expect(found).toBeNull();
  });

  it("returns null when there is nothing to match on", async () => {
    await seedInvoice({ id: "inv-1", invoiceNumber: "INV-902", totalAmount: 42 });

    const found = await findDuplicateSupplierInvoice({
      organizationId: ORG,
      invoiceNumber: "INV-902",
      totalAmount: null,
    });

    expect(found).toBeNull();
  });
});
