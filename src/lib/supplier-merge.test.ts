import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import {
  db,
  emailContacts,
  invoices,
  notes,
  organizations,
  routingRules,
  suppliers,
  users,
} from "@/lib/db";
import { mergeSuppliers } from "@/lib/supplier-merge";

const ORG = "org-merge";
const OTHER_ORG = "org-merge-other";
const USER = "user-merge";
const KEEP = "supplier-keep";
const DUPE = "supplier-dupe";

async function seed() {
  await db.delete(routingRules);
  await db.delete(emailContacts);
  await db.delete(notes);
  await db.delete(invoices);
  await db.delete(suppliers);
  await db.delete(users);
  await db.delete(organizations);

  await db.insert(organizations).values([
    { id: ORG, name: "Shipeedo", slug: "shipeedo-merge" },
    { id: OTHER_ORG, name: "Other", slug: "other-merge" },
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
    {
      id: KEEP,
      organizationId: ORG,
      name: "CartonCloud Pty Ltd",
      emailAddresses: JSON.stringify(["accounts@cartoncloud.com"]),
      emailDomains: JSON.stringify(["cartoncloud.com"]),
      tradingTermDays: 14,
    },
    {
      id: DUPE,
      organizationId: ORG,
      name: "Cartoncloud",
      emailAddresses: JSON.stringify(["ACCOUNTS@cartoncloud.com", "ar@cartoncloud.com"]),
      emailDomains: JSON.stringify(["cartoncloud.com.au"]),
      tradingTermDays: 30,
      extractionPrompt: "Duplicate prompt",
    },
  ]);
  await db.insert(invoices).values([
    { id: "invoice-a", organizationId: ORG, supplierId: DUPE, status: "PENDING_APPROVAL" },
    { id: "invoice-b", organizationId: ORG, supplierId: DUPE, status: "PENDING_APPROVAL" },
    { id: "invoice-c", organizationId: ORG, supplierId: KEEP, status: "PENDING_APPROVAL" },
  ]);
  await db.insert(notes).values({
    id: "note-dupe",
    supplierId: DUPE,
    userId: USER,
    content: "Chases payment weekly",
  });
  await db.insert(emailContacts).values({
    id: "contact-dupe",
    organizationId: ORG,
    email: "ar@cartoncloud.com",
    supplierId: DUPE,
  });
}

async function merge() {
  const result = await mergeSuppliers({
    sourceId: DUPE,
    targetId: KEEP,
    organizationId: ORG,
    userId: USER,
  });
  if ("error" in result) throw new Error(`merge failed: ${result.error}`);
  return result;
}

describe("mergeSuppliers", () => {
  beforeEach(seed);

  it("relinks invoices and deletes the duplicate", async () => {
    const result = await merge();

    expect(result.counts.invoices).toBe(2);

    const moved = await db.query.invoices.findMany({
      where: eq(invoices.supplierId, KEEP),
    });
    expect(moved.map((invoice) => invoice.id).sort()).toEqual([
      "invoice-a",
      "invoice-b",
      "invoice-c",
    ]);

    const remaining = await db.query.suppliers.findMany({
      where: eq(suppliers.organizationId, ORG),
    });
    expect(remaining.map((supplier) => supplier.id)).toEqual([KEEP]);
  });

  it("moves notes across and records the merge on the survivor", async () => {
    const result = await merge();

    expect(result.counts.notes).toBe(1);

    const survivorNotes = await db.query.notes.findMany({
      where: eq(notes.supplierId, KEEP),
    });
    expect(survivorNotes).toHaveLength(2);
    expect(survivorNotes.some((note) => note.content.includes("Cartoncloud"))).toBe(true);
  });

  it("unions email addresses and domains without case-duplicates", async () => {
    await merge();

    const survivor = await db.query.suppliers.findFirst({
      where: eq(suppliers.id, KEEP),
    });
    expect(JSON.parse(survivor!.emailAddresses)).toEqual([
      "accounts@cartoncloud.com",
      "ar@cartoncloud.com",
    ]);
    expect(JSON.parse(survivor!.emailDomains)).toEqual([
      "cartoncloud.com",
      "cartoncloud.com.au",
    ]);
  });

  it("returns the survivor's post-merge row so callers need not recompute it", async () => {
    const result = await merge();

    expect(JSON.parse(result.survivor.emailAddresses)).toEqual([
      "accounts@cartoncloud.com",
      "ar@cartoncloud.com",
    ]);
    expect(JSON.parse(result.survivor.emailDomains)).toEqual([
      "cartoncloud.com",
      "cartoncloud.com.au",
    ]);
    expect(result.survivor.extractionPrompt).toBe("Duplicate prompt");

    const stored = await db.query.suppliers.findFirst({
      where: eq(suppliers.id, KEEP),
    });
    expect(result.survivor).toEqual(stored);
  });

  it("keeps the survivor's trading terms but adopts the duplicate's prompt", async () => {
    await merge();

    const survivor = await db.query.suppliers.findFirst({
      where: eq(suppliers.id, KEEP),
    });
    expect(survivor!.tradingTermDays).toBe(14);
    expect(survivor!.extractionPrompt).toBe("Duplicate prompt");
  });

  it("repoints routing rules that referenced the duplicate", async () => {
    await db.insert(routingRules).values([
      {
        id: "rule-legacy",
        organizationId: ORG,
        name: "Dupe rule",
        priority: 1,
        type: "SUPPLIER",
        condition: JSON.stringify({ supplierId: DUPE, supplierName: "Cartoncloud" }),
      },
      {
        id: "rule-combo",
        organizationId: ORG,
        name: "Combo rule",
        priority: 2,
        type: "COMBO",
        condition: JSON.stringify({
          conditions: [
            { kind: "SUPPLIER", supplierId: DUPE },
            { kind: "AMOUNT_THRESHOLD", minAmount: 500 },
          ],
        }),
      },
      {
        id: "rule-untouched",
        organizationId: ORG,
        name: "Other supplier rule",
        priority: 3,
        type: "SUPPLIER",
        condition: JSON.stringify({ supplierId: KEEP }),
      },
    ]);

    const result = await merge();
    expect(result.counts.routingRules).toBe(2);

    const legacy = await db.query.routingRules.findFirst({
      where: eq(routingRules.id, "rule-legacy"),
    });
    expect(JSON.parse(legacy!.condition)).toEqual({
      supplierId: KEEP,
      supplierName: "CartonCloud Pty Ltd",
    });

    const combo = await db.query.routingRules.findFirst({
      where: eq(routingRules.id, "rule-combo"),
    });
    expect(JSON.parse(combo!.condition).conditions[0].supplierId).toBe(KEEP);
  });

  it("moves email contacts", async () => {
    await merge();

    const contact = await db.query.emailContacts.findFirst({
      where: eq(emailContacts.id, "contact-dupe"),
    });
    expect(contact!.supplierId).toBe(KEEP);
  });

  it("refuses to merge a supplier into itself", async () => {
    const result = await mergeSuppliers({
      sourceId: DUPE,
      targetId: DUPE,
      organizationId: ORG,
      userId: USER,
    });
    expect(result).toEqual({ error: "same_supplier" });
  });

  it("refuses to merge across organizations", async () => {
    const result = await mergeSuppliers({
      sourceId: DUPE,
      targetId: KEEP,
      organizationId: OTHER_ORG,
      userId: USER,
    });
    expect(result).toEqual({ error: "not_found" });

    const survivors = await db.query.suppliers.findMany({
      where: eq(suppliers.organizationId, ORG),
    });
    expect(survivors).toHaveLength(2);
  });
});
