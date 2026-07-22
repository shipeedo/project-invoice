import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db, invoices, organizations, suppliers, users } from "@/lib/db";
import { validateInvoice } from "@/lib/invoices";

const ORG = "org-validate";
const VALIDATOR = "user-validator";

async function seed() {
  await db.delete(invoices);
  await db.delete(suppliers);
  await db.delete(users);
  await db.delete(organizations);

  await db
    .insert(organizations)
    .values({ id: ORG, name: "Shipeedo", slug: "shipeedo-validate" });
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

  it("drops the link entirely when the retyped supplier matches no record", async () => {
    const invoice = await draftInvoice();

    await validateInvoice({
      organizationId: ORG,
      userId: VALIDATOR,
      invoiceId: invoice.id,
      fields: fields({ vendorName: "Totally New Freight Co", vendorEmail: null }),
    });

    expect(await linkedSupplierId(invoice.id)).toBeNull();
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

  it("detaches on an explicit null instead of falling back to the old link", async () => {
    const invoice = await draftInvoice();

    await validateInvoice({
      organizationId: ORG,
      userId: VALIDATOR,
      invoiceId: invoice.id,
      fields: fields(),
      supplierId: null,
    });

    expect(await linkedSupplierId(invoice.id)).toBeNull();
  });

  it("creates and links a new supplier when asked to", async () => {
    const invoice = await draftInvoice({ supplierId: null, vendorName: null });

    await validateInvoice({
      organizationId: ORG,
      userId: VALIDATOR,
      invoiceId: invoice.id,
      fields: fields({ vendorName: "Brand New Carrier", vendorEmail: null }),
      createSupplier: { name: "Brand New Carrier" },
    });

    const linked = await linkedSupplierId(invoice.id);
    const created = await db.query.suppliers.findFirst({
      where: eq(suppliers.name, "Brand New Carrier"),
    });
    expect(linked).toBe(created?.id);
  });
});
