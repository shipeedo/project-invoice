import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db, invoices, organizations, suppliers, users } from "@/lib/db";
import { linkInvoiceSupplier, validateInvoice } from "@/lib/invoices";

const ORG = "org-validate";
const OTHER_ORG = "org-elsewhere";
const VALIDATOR = "user-validator";

async function seed() {
  await db.delete(invoices);
  await db.delete(suppliers);
  await db.delete(users);
  await db.delete(organizations);

  await db.insert(organizations).values([
    { id: ORG, name: "Shipeedo", slug: "shipeedo-validate" },
    { id: OTHER_ORG, name: "Elsewhere", slug: "elsewhere-validate" },
  ]);
  await db.insert(users).values({
    id: VALIDATOR,
    organizationId: ORG,
    email: "robert@shipeedo.test",
    name: "Robert Lynch",
    role: "ADMIN",
    hasAccess: true,
  });
  await db.insert(suppliers).values([
    {
      id: "supplier-cartoncloud",
      organizationId: ORG,
      name: "CartonCloud Pty Ltd",
      emailAddresses: JSON.stringify(["accounts@cartoncloud.com"]),
      emailDomains: JSON.stringify(["cartoncloud.com"]),
    },
    {
      id: "supplier-snapes",
      organizationId: ORG,
      name: "Snapes Project Logistics",
      emailAddresses: JSON.stringify([]),
      emailDomains: JSON.stringify(["snapes.com.au"]),
    },
    {
      id: "supplier-elsewhere",
      organizationId: OTHER_ORG,
      name: "Another Org's Carrier",
      emailAddresses: JSON.stringify([]),
      emailDomains: JSON.stringify([]),
    },
  ]);
}

async function draftInvoice(overrides: Record<string, unknown> = {}) {
  const [invoice] = await db
    .insert(invoices)
    .values({
      organizationId: ORG,
      status: "DRAFT",
      vendorName: "CartonCloud Pty Ltd",
      vendorEmail: "accounts@cartoncloud.com",
      supplierId: "supplier-cartoncloud",
      ...overrides,
    })
    .returning();
  return invoice;
}

function fields(overrides: Record<string, unknown> = {}) {
  return {
    vendorName: "CartonCloud Pty Ltd",
    vendorEmail: "accounts@cartoncloud.com",
    invoiceNumber: "INV-1184",
    ...overrides,
  };
}

async function linkedSupplierId(invoiceId: string) {
  const row = await db.query.invoices.findFirst({
    where: eq(invoices.id, invoiceId),
    columns: { supplierId: true },
  });
  return row?.supplierId ?? null;
}

async function invoiceStatus(invoiceId: string) {
  const row = await db.query.invoices.findFirst({
    where: eq(invoices.id, invoiceId),
    columns: { status: true },
  });
  return row?.status ?? null;
}

describe("validateInvoice supplier linking", () => {
  beforeEach(seed);

  it("keeps the linked supplier when the submitted fields still match it", async () => {
    const invoice = await draftInvoice();

    await validateInvoice({
      organizationId: ORG,
      userId: VALIDATOR,
      invoiceId: invoice.id,
      fields: fields(),
    });

    expect(await linkedSupplierId(invoice.id)).toBe("supplier-cartoncloud");
  });

  it("re-links when the validator retypes the supplier name without touching the picker", async () => {
    // The production bug: the panel omits supplierId when no supplier is picked,
    // so the invoice kept its CartonCloud link while the header read Snapes.
    const invoice = await draftInvoice();

    await validateInvoice({
      organizationId: ORG,
      userId: VALIDATOR,
      invoiceId: invoice.id,
      fields: fields({
        vendorName: "Snapes Project Logistics",
        vendorEmail: "accounts@snapes.com.au",
      }),
    });

    expect(await linkedSupplierId(invoice.id)).toBe("supplier-snapes");
  });

  it("refuses to route when the retyped supplier matches no record", async () => {
    // Approval routing reads the supplier, so an unresolvable one stops the
    // invoice in DRAFT rather than routing it unlinked.
    const invoice = await draftInvoice();

    const result = await validateInvoice({
      organizationId: ORG,
      userId: VALIDATOR,
      invoiceId: invoice.id,
      fields: fields({ vendorName: "Totally New Freight Co", vendorEmail: null }),
    });

    expect(result).toEqual({
      error: "Link a supplier before routing for approval",
    });
    expect(await invoiceStatus(invoice.id)).toBe("DRAFT");
    expect(await linkedSupplierId(invoice.id)).toBe("supplier-cartoncloud");
  });

  it("keeps the link when only the trading name changed but the email still matches", async () => {
    const invoice = await draftInvoice();

    await validateInvoice({
      organizationId: ORG,
      userId: VALIDATOR,
      invoiceId: invoice.id,
      fields: fields({ vendorName: "CartonCloud (AU)" }),
    });

    expect(await linkedSupplierId(invoice.id)).toBe("supplier-cartoncloud");
  });

  it("honours an explicitly picked supplier over the submitted name", async () => {
    const invoice = await draftInvoice();

    await validateInvoice({
      organizationId: ORG,
      userId: VALIDATOR,
      invoiceId: invoice.id,
      fields: fields(),
      supplierId: "supplier-snapes",
    });

    expect(await linkedSupplierId(invoice.id)).toBe("supplier-snapes");
  });

  it("refuses to route on an explicit detach", async () => {
    const invoice = await draftInvoice();

    const result = await validateInvoice({
      organizationId: ORG,
      userId: VALIDATOR,
      invoiceId: invoice.id,
      fields: fields(),
      supplierId: null,
    });

    expect(result).toEqual({
      error: "Link a supplier before routing for approval",
    });
    expect(await invoiceStatus(invoice.id)).toBe("DRAFT");
  });
});

describe("linkInvoiceSupplier", () => {
  beforeEach(seed);

  it("links the supplier the reviewer picked and confirms the vendor fields", async () => {
    const invoice = await draftInvoice({ supplierId: null, vendorName: null });

    const result = await linkInvoiceSupplier({
      organizationId: ORG,
      userId: VALIDATOR,
      invoiceId: invoice.id,
      vendorName: "Snapes Project Logistics",
      vendorEmail: "accounts@snapes.com.au",
      supplierId: "supplier-snapes",
    });

    expect(result).toMatchObject({ created: false });
    expect(await linkedSupplierId(invoice.id)).toBe("supplier-snapes");

    const row = await db.query.invoices.findFirst({
      where: eq(invoices.id, invoice.id),
      columns: { vendorName: true, vendorEmail: true },
    });
    expect(row?.vendorName).toBe("Snapes Project Logistics");
    expect(row?.vendorEmail).toBe("accounts@snapes.com.au");
  });

  it("reuses a supplier reachable on its domain rather than creating a duplicate", async () => {
    // The screen ranks matches on the name and email it can see; Snapes is
    // reachable on a domain it was never told about, so creating outright here
    // would duplicate it.
    const invoice = await draftInvoice();
    const before = await db.query.suppliers.findMany();

    await linkInvoiceSupplier({
      organizationId: ORG,
      userId: VALIDATOR,
      invoiceId: invoice.id,
      vendorName: "Snapes Logistics Group",
      vendorEmail: "billing@snapes.com.au",
      createSupplier: true,
    });

    expect(await linkedSupplierId(invoice.id)).toBe("supplier-snapes");
    expect(await db.query.suppliers.findMany()).toHaveLength(before.length);
  });

  it("creates a supplier from the confirmed fields when nothing matches", async () => {
    const invoice = await draftInvoice({ supplierId: null, vendorName: null });

    await linkInvoiceSupplier({
      organizationId: ORG,
      userId: VALIDATOR,
      invoiceId: invoice.id,
      vendorName: "Brand New Carrier",
      vendorEmail: "accounts@brandnew.test",
      createSupplier: true,
    });

    const created = await db.query.suppliers.findFirst({
      where: eq(suppliers.name, "Brand New Carrier"),
    });
    expect(await linkedSupplierId(invoice.id)).toBe(created?.id);
    expect(JSON.parse(created!.emailAddresses)).toEqual(["accounts@brandnew.test"]);
    // Recorded so a later invoice from someone else at the same company matches.
    expect(JSON.parse(created!.emailDomains)).toEqual(["brandnew.test"]);
  });

  it("records no contact details from a relayed platform address", async () => {
    // One Xero address fronts many customers, so keeping either it or its
    // domain would match all of their later invoices to whichever supplier was
    // created first. The invoice still records who actually sent it.
    const invoice = await draftInvoice({ supplierId: null, vendorName: null });

    await linkInvoiceSupplier({
      organizationId: ORG,
      userId: VALIDATOR,
      invoiceId: invoice.id,
      vendorName: "Relayed Freight Co",
      vendorEmail: "messaging-service@post.xero.com",
      createSupplier: true,
    });

    const created = await db.query.suppliers.findFirst({
      where: eq(suppliers.name, "Relayed Freight Co"),
    });
    expect(JSON.parse(created!.emailAddresses)).toEqual([]);
    expect(JSON.parse(created!.emailDomains)).toEqual([]);

    const row = await db.query.invoices.findFirst({
      where: eq(invoices.id, invoice.id),
      columns: { vendorEmail: true },
    });
    expect(row?.vendorEmail).toBe("messaging-service@post.xero.com");
  });

  it("does not match a second supplier onto the first one's relay address", async () => {
    // The failure this guards: two unrelated companies both invoicing through
    // Xero would otherwise collapse onto one supplier record.
    const first = await draftInvoice({ supplierId: null, vendorName: null });
    await linkInvoiceSupplier({
      organizationId: ORG,
      userId: VALIDATOR,
      invoiceId: first.id,
      vendorName: "First Relayed Co",
      vendorEmail: "messaging-service@post.xero.com",
      createSupplier: true,
    });

    const second = await draftInvoice({ supplierId: null, vendorName: null });
    await linkInvoiceSupplier({
      organizationId: ORG,
      userId: VALIDATOR,
      invoiceId: second.id,
      vendorName: "Second Relayed Co",
      vendorEmail: "messaging-service@post.xero.com",
      createSupplier: true,
    });

    const firstSupplier = await db.query.suppliers.findFirst({
      where: eq(suppliers.name, "First Relayed Co"),
    });
    const secondSupplier = await db.query.suppliers.findFirst({
      where: eq(suppliers.name, "Second Relayed Co"),
    });

    expect(secondSupplier).toBeDefined();
    expect(await linkedSupplierId(second.id)).toBe(secondSupplier!.id);
    expect(secondSupplier!.id).not.toBe(firstSupplier!.id);
  });

  it("refuses a supplier from another organisation", async () => {
    const invoice = await draftInvoice();

    const result = await linkInvoiceSupplier({
      organizationId: ORG,
      userId: VALIDATOR,
      invoiceId: invoice.id,
      vendorName: "CartonCloud Pty Ltd",
      supplierId: "supplier-elsewhere",
    });

    expect(result).toEqual({ error: "Supplier not found" });
    expect(await linkedSupplierId(invoice.id)).toBe("supplier-cartoncloud");
  });

  it("refuses to link once the invoice has left DRAFT", async () => {
    const invoice = await draftInvoice({ status: "PENDING_APPROVAL" });

    const result = await linkInvoiceSupplier({
      organizationId: ORG,
      userId: VALIDATOR,
      invoiceId: invoice.id,
      vendorName: "Snapes Project Logistics",
      supplierId: "supplier-snapes",
    });

    expect(result).toEqual({ error: "Invoice is not awaiting validation" });
  });

  it("requires a choice rather than guessing", async () => {
    const invoice = await draftInvoice({ supplierId: null });

    const result = await linkInvoiceSupplier({
      organizationId: ORG,
      userId: VALIDATOR,
      invoiceId: invoice.id,
      vendorName: "CartonCloud Pty Ltd",
    });

    expect(result).toEqual({ error: "Pick a supplier to link, or create one" });
    expect(await linkedSupplierId(invoice.id)).toBeNull();
  });

  it("routes for approval once the supplier is linked", async () => {
    const invoice = await draftInvoice({ supplierId: null, vendorName: null });

    await linkInvoiceSupplier({
      organizationId: ORG,
      userId: VALIDATOR,
      invoiceId: invoice.id,
      vendorName: "CartonCloud",
      vendorEmail: "accounts@cartoncloud.com",
      supplierId: "supplier-cartoncloud",
    });

    const result = await validateInvoice({
      organizationId: ORG,
      userId: VALIDATOR,
      invoiceId: invoice.id,
      fields: fields({ vendorName: "CartonCloud" }),
      supplierId: "supplier-cartoncloud",
    });

    expect("error" in result).toBe(false);
    expect(await linkedSupplierId(invoice.id)).toBe("supplier-cartoncloud");
  });
});
