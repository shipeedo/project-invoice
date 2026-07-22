import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { auditEvents, db, invoices, organizations, suppliers, users } from "@/lib/db";
import { changeInvoiceSupplier } from "@/lib/invoices";

const ORG = "org-supplier-change";
const OTHER_ORG = "org-supplier-change-other";
const USER = "user-supplier-change";
const FEDEX = "supplier-fedex";
const SHIPEEDO = "supplier-shipeedo";
const FOREIGN = "supplier-foreign";
const INVOICE = "invoice-supplier-change";

async function seed() {
  await db.delete(auditEvents);
  await db.delete(invoices);
  await db.delete(suppliers);
  await db.delete(users);
  await db.delete(organizations);

  await db.insert(organizations).values([
    { id: ORG, name: "Shipeedo", slug: "shipeedo-supplier-change" },
    { id: OTHER_ORG, name: "Other", slug: "other-supplier-change" },
  ]);
  await db.insert(users).values({
    id: USER,
    organizationId: ORG,
    email: "robert@shipeedo.test",
    name: "Robert Lynch",
    role: "ADMIN",
    hasAccess: true,
  });
  await db.insert(suppliers).values([
    { id: FEDEX, organizationId: ORG, name: "FedEx", tradingTermDays: 30 },
    { id: SHIPEEDO, organizationId: ORG, name: "Shipeedo IP", tradingTermDays: 14 },
    { id: FOREIGN, organizationId: OTHER_ORG, name: "Someone else" },
  ]);
  await db.insert(invoices).values({
    id: INVOICE,
    organizationId: ORG,
    status: "APPROVED",
    supplierId: FEDEX,
    vendorName: "Shipeedo IP",
    vendorEmail: "r.lynch@couriersandfreight.com.au",
    invoiceDate: new Date("2026-07-01T00:00:00.000Z"),
    // What FedEx's 30-day terms produced, over a document stating 7 July.
    dueDate: new Date("2026-07-31T00:00:00.000Z"),
    originalDueDate: new Date("2026-07-07T00:00:00.000Z"),
  });
}

function change(supplierId: string, invoiceId = INVOICE) {
  return changeInvoiceSupplier({
    organizationId: ORG,
    userId: USER,
    invoiceId,
    supplierId,
  });
}

async function loadInvoice() {
  const invoice = await db.query.invoices.findFirst({
    where: eq(invoices.id, INVOICE),
  });
  if (!invoice) throw new Error("invoice missing");
  return invoice;
}

describe("changeInvoiceSupplier", () => {
  beforeEach(seed);

  it("re-points an approved invoice and leaves the extracted fields alone", async () => {
    const result = await change(SHIPEEDO);

    expect("error" in result).toBe(false);
    const invoice = await loadInvoice();
    expect(invoice.supplierId).toBe(SHIPEEDO);
    expect(invoice.status).toBe("APPROVED");
    expect(invoice.vendorName).toBe("Shipeedo IP");
    expect(invoice.vendorEmail).toBe("r.lynch@couriersandfreight.com.au");
  });

  it("records the move on the audit trail", async () => {
    await change(SHIPEEDO);

    const events = await db.query.auditEvents.findMany({
      where: eq(auditEvents.invoiceId, INVOICE),
    });
    const changed = events.find(
      (event) => event.action === "invoice.supplier_changed",
    );
    expect(changed).toBeDefined();
    expect(JSON.parse(changed!.details!)).toMatchObject({
      supplierId: SHIPEEDO,
      supplierName: "Shipeedo IP",
      previousSupplierId: FEDEX,
      previousSupplierName: "FedEx",
    });
  });

  it("is a no-op when the supplier is already linked", async () => {
    const result = await change(FEDEX);

    expect(result).toMatchObject({ changed: false });
    const events = await db.query.auditEvents.findMany({
      where: eq(auditEvents.invoiceId, INVOICE),
    });
    expect(events).toHaveLength(0);
  });

  it("refuses a supplier from another organization", async () => {
    const result = await change(FOREIGN);

    expect(result).toEqual({ error: "Supplier not found" });
    expect((await loadInvoice()).supplierId).toBe(FEDEX);
  });

  it("refuses an invoice from another organization", async () => {
    await db.insert(invoices).values({
      id: "invoice-foreign",
      organizationId: OTHER_ORG,
      status: "APPROVED",
      supplierId: FOREIGN,
    });

    const result = await change(SHIPEEDO, "invoice-foreign");

    expect(result).toEqual({ error: "Not found" });
  });

  it("re-derives the due date from the new supplier's trading terms", async () => {
    await change(SHIPEEDO);

    const invoice = await loadInvoice();
    // 1 July + Shipeedo IP's 14 days, not FedEx's 30.
    expect(invoice.dueDate?.toISOString()).toBe("2026-07-15T00:00:00.000Z");
    // The document's own due date is still what the override is measured against.
    expect(invoice.originalDueDate?.toISOString()).toBe(
      "2026-07-07T00:00:00.000Z",
    );

    const events = await db.query.auditEvents.findMany({
      where: eq(auditEvents.invoiceId, INVOICE),
    });
    const changed = events.find(
      (event) => event.action === "invoice.supplier_changed",
    );
    expect(JSON.parse(changed!.details!)).toMatchObject({
      previousDueDate: "2026-07-31T00:00:00.000Z",
      dueDate: "2026-07-15T00:00:00.000Z",
      tradingTermDays: 14,
    });
  });

  it("falls back to the stated due date when the new supplier has no terms", async () => {
    await db
      .update(suppliers)
      .set({ tradingTermDays: null })
      .where(eq(suppliers.id, SHIPEEDO));

    await change(SHIPEEDO);

    const invoice = await loadInvoice();
    expect(invoice.dueDate?.toISOString()).toBe("2026-07-07T00:00:00.000Z");
    expect(invoice.originalDueDate).toBeNull();
  });

  it("refuses a draft, which settles its supplier during validation", async () => {
    await db
      .update(invoices)
      .set({ status: "DRAFT" })
      .where(eq(invoices.id, INVOICE));

    const result = await change(SHIPEEDO);

    expect(result).toEqual({
      error: "Confirm the supplier from the validation panel",
    });
    expect((await loadInvoice()).supplierId).toBe(FEDEX);
  });

  it("refuses a cancelled invoice", async () => {
    await db
      .update(invoices)
      .set({ status: "CANCELLED" })
      .where(eq(invoices.id, INVOICE));

    const result = await change(SHIPEEDO);

    expect(result).toEqual({ error: "Cancelled invoices cannot be changed" });
    expect((await loadInvoice()).supplierId).toBe(FEDEX);
  });

  it("refuses a trashed invoice", async () => {
    await db
      .update(invoices)
      .set({ deletedAt: new Date() })
      .where(eq(invoices.id, INVOICE));

    const result = await change(SHIPEEDO);

    expect(result).toMatchObject({
      error: "Restore this invoice before changing its supplier",
    });
    expect((await loadInvoice()).supplierId).toBe(FEDEX);
  });
});
