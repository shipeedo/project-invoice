import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { addCreditDocuments } from "@/lib/credit-documents";
import { createCreditRequest, recordCreditRequestOutcome } from "@/lib/credit-lines";
import {
  auditEvents,
  db,
  invoiceDocuments,
  invoices,
  notes,
  organizations,
  users,
} from "@/lib/db";

async function seed(slug: string) {
  const [org] = await db
    .insert(organizations)
    .values({ name: `Org ${slug}`, slug })
    .returning();

  const [user] = await db
    .insert(users)
    .values({ organizationId: org.id, email: `user-${slug}@example.com`, name: "User" })
    .returning();

  const [invoice] = await db
    .insert(invoices)
    .values({ organizationId: org.id, vendorName: "Pegasus" })
    .returning();

  return { org, user, invoice };
}

async function seedCreditRequest(slug: string) {
  const { org, user, invoice } = await seed(slug);
  const outcome = await createCreditRequest({
    organizationId: org.id,
    userId: user.id,
    invoiceId: invoice.id,
    lines: [
      {
        description: "Fuel surcharge overcharged",
        requestedAmount: 50,
        reason: "OTHER",
        reasonDetail: "Wrong rate",
      },
    ],
  });
  if ("error" in outcome) throw new Error(outcome.error);
  return { org, user, invoice, creditRequest: outcome.creditRequest };
}

describe("addCreditDocuments", () => {
  it("creates CREDIT documents and links an optional note to the first one", async () => {
    const { org, user, invoice } = await seed("add-docs");

    const created = await addCreditDocuments({
      organizationId: org.id,
      invoiceId: invoice.id,
      creditRequestId: null,
      uploadedById: user.id,
      files: [
        {
          fileName: "evidence.pdf",
          filePath: "uploads/invoices/evidence.pdf",
          mimeType: "application/pdf",
          size: 123,
        },
        {
          fileName: "rates.csv",
          filePath: "uploads/invoices/rates.csv",
          mimeType: "text/csv",
          size: 45,
        },
      ],
      note: "Attached supporting files",
    });

    expect(created).toHaveLength(2);
    const rows = await db.query.invoiceDocuments.findMany({
      where: eq(invoiceDocuments.invoiceId, invoice.id),
    });
    expect(rows).toHaveLength(2);
    expect(rows.every((row) => row.kind === "CREDIT")).toBe(true);
    expect(rows.every((row) => row.organizationId === org.id)).toBe(true);
    expect(rows.every((row) => row.uploadedById === user.id)).toBe(true);
    expect(rows.every((row) => row.creditRequestId === null)).toBe(true);

    const noteRows = await db.query.notes.findMany({
      where: eq(notes.invoiceId, invoice.id),
    });
    expect(noteRows).toHaveLength(1);
    expect(noteRows[0].content).toBe("Attached supporting files");
    expect(noteRows[0].documentId).toBe(created[0].id);
    expect(noteRows[0].userId).toBe(user.id);
  });

  it("stores a note without a document link when no files are given", async () => {
    const { org, user, invoice } = await seed("note-only");

    await addCreditDocuments({
      organizationId: org.id,
      invoiceId: invoice.id,
      uploadedById: user.id,
      files: [],
      note: "Carrier denied, no credit note issued",
    });

    const noteRows = await db.query.notes.findMany({
      where: eq(notes.invoiceId, invoice.id),
    });
    expect(noteRows).toHaveLength(1);
    expect(noteRows[0].documentId).toBeNull();
  });
});

describe("recordCreditRequestOutcome with credit note files", () => {
  it("mirrors attachments into CREDIT documents tied to the credit request", async () => {
    const { org, user, invoice, creditRequest } = await seedCreditRequest("outcome-docs");

    const outcome = await recordCreditRequestOutcome({
      organizationId: org.id,
      userId: user.id,
      creditRequestId: creditRequest.id,
      outcome: "approved",
      approvedAmount: 40,
      attachments: [
        {
          fileName: "credit-note.pdf",
          filePath: "uploads/invoices/credit-note.pdf",
          mimeType: "application/pdf",
          size: 999,
        },
      ],
      note: "Credit note received from carrier",
    });

    expect("error" in outcome).toBe(false);

    const documents = await db.query.invoiceDocuments.findMany({
      where: eq(invoiceDocuments.invoiceId, invoice.id),
    });
    expect(documents).toHaveLength(1);
    expect(documents[0].kind).toBe("CREDIT");
    expect(documents[0].creditRequestId).toBe(creditRequest.id);
    expect(documents[0].fileName).toBe("credit-note.pdf");
    expect(documents[0].filePath).toBe("uploads/invoices/credit-note.pdf");
    expect(documents[0].uploadedById).toBe(user.id);

    const noteRows = await db.query.notes.findMany({
      where: eq(notes.invoiceId, invoice.id),
    });
    expect(noteRows).toHaveLength(1);
    expect(noteRows[0].documentId).toBe(documents[0].id);

    const events = await db.query.auditEvents.findMany({
      where: eq(auditEvents.invoiceId, invoice.id),
    });
    const updated = events.find((event) => event.action === "credit_request.updated");
    expect(updated).toBeDefined();
    const details = JSON.parse(updated!.details ?? "{}") as { fileNames?: string[] };
    expect(details.fileNames).toEqual(["credit-note.pdf"]);
  });

  it("creates no documents or notes when the outcome has no files or note", async () => {
    const { org, user, invoice, creditRequest } = await seedCreditRequest("outcome-plain");

    const outcome = await recordCreditRequestOutcome({
      organizationId: org.id,
      userId: user.id,
      creditRequestId: creditRequest.id,
      outcome: "denied",
    });

    expect("error" in outcome).toBe(false);

    const documents = await db.query.invoiceDocuments.findMany({
      where: eq(invoiceDocuments.invoiceId, invoice.id),
    });
    expect(documents).toHaveLength(0);

    const noteRows = await db.query.notes.findMany({
      where: eq(notes.invoiceId, invoice.id),
    });
    expect(noteRows).toHaveLength(0);
  });

  it("still rejects closed credit requests before touching documents", async () => {
    const { org, user, invoice, creditRequest } = await seedCreditRequest("outcome-closed");

    const first = await recordCreditRequestOutcome({
      organizationId: org.id,
      userId: user.id,
      creditRequestId: creditRequest.id,
      outcome: "denied",
    });
    expect("error" in first).toBe(false);

    const second = await recordCreditRequestOutcome({
      organizationId: org.id,
      userId: user.id,
      creditRequestId: creditRequest.id,
      outcome: "approved",
      approvedAmount: 10,
      attachments: [
        {
          fileName: "late.pdf",
          filePath: "uploads/invoices/late.pdf",
          mimeType: "application/pdf",
          size: 1,
        },
      ],
    });
    expect(second).toEqual({ error: "Credit request is already closed" });

    const documents = await db.query.invoiceDocuments.findMany({
      where: eq(invoiceDocuments.invoiceId, invoice.id),
    });
    expect(documents).toHaveLength(0);
  });
});
