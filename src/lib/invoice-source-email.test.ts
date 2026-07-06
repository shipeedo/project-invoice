import { describe, expect, it } from "vitest";
import {
  parseRecipientEmails,
  resolveInvoiceSourceEmail,
} from "@/lib/invoice-source-email";

function emailInvoice(
  overrides: Partial<Parameters<typeof resolveInvoiceSourceEmail>[0]["invoice"]> = {},
) {
  return {
    sourceType: "EMAIL" as const,
    emailSubject: "Invoice INV-100",
    emailFrom: "billing@carrier.com",
    emailFromName: "Carrier Billing",
    emailReceivedAt: new Date("2026-06-01T02:00:00Z"),
    emailBodyHtml: "<p>Snapshot body</p>",
    emailBodyText: "Snapshot body",
    ...overrides,
  };
}

function mailboxMessage(
  overrides: Partial<
    NonNullable<Parameters<typeof resolveInvoiceSourceEmail>[0]["message"]>
  > = {},
) {
  return {
    subject: "FW: Invoice INV-100",
    fromEmail: "accounts@carrier.com",
    fromName: "Carrier Accounts",
    toEmails: '["ap@shipeedo.com"]',
    ccEmails: '["ops@shipeedo.com"]',
    receivedAt: new Date("2026-06-02T02:00:00Z"),
    bodyHtml: "<p>Mailbox body</p>",
    bodyText: "Mailbox body",
    threadId: "thread_1",
    attachments: [
      { id: "att_1", fileName: "invoice.pdf", isInline: false, contentId: null },
    ],
    ...overrides,
  };
}

describe("parseRecipientEmails", () => {
  it("parses a JSON array of addresses", () => {
    expect(parseRecipientEmails('["a@x.com","b@x.com"]')).toEqual([
      "a@x.com",
      "b@x.com",
    ]);
  });

  it("returns an empty list for null, invalid JSON, or non-arrays", () => {
    expect(parseRecipientEmails(null)).toEqual([]);
    expect(parseRecipientEmails(undefined)).toEqual([]);
    expect(parseRecipientEmails("not json")).toEqual([]);
    expect(parseRecipientEmails('{"a":1}')).toEqual([]);
  });

  it("drops non-string entries", () => {
    expect(parseRecipientEmails('["a@x.com", 3, null]')).toEqual(["a@x.com"]);
  });
});

describe("resolveInvoiceSourceEmail", () => {
  it("returns null for uploaded invoices", () => {
    expect(
      resolveInvoiceSourceEmail({
        invoice: emailInvoice({ sourceType: "UPLOAD" }),
        message: mailboxMessage(),
      }),
    ).toBeNull();
  });

  it("prefers the mailbox message when linked", () => {
    const resolved = resolveInvoiceSourceEmail({
      invoice: emailInvoice(),
      message: mailboxMessage(),
    });

    expect(resolved).toMatchObject({
      subject: "FW: Invoice INV-100",
      fromEmail: "accounts@carrier.com",
      fromName: "Carrier Accounts",
      toEmails: ["ap@shipeedo.com"],
      ccEmails: ["ops@shipeedo.com"],
      bodyHtml: "<p>Mailbox body</p>",
      threadId: "thread_1",
    });
    expect(resolved?.receivedAt).toEqual(new Date("2026-06-02T02:00:00Z"));
    expect(resolved?.attachments).toHaveLength(1);
  });

  it("falls back to the invoice snapshot without a mailbox message", () => {
    const resolved = resolveInvoiceSourceEmail({
      invoice: emailInvoice(),
      message: null,
    });

    expect(resolved).toMatchObject({
      subject: "Invoice INV-100",
      fromEmail: "billing@carrier.com",
      fromName: "Carrier Billing",
      toEmails: [],
      ccEmails: [],
      bodyHtml: "<p>Snapshot body</p>",
      bodyText: "Snapshot body",
      threadId: null,
      attachments: [],
    });
    expect(resolved?.receivedAt).toEqual(new Date("2026-06-01T02:00:00Z"));
  });

  it("fills missing message headers from the snapshot", () => {
    const resolved = resolveInvoiceSourceEmail({
      invoice: emailInvoice(),
      message: mailboxMessage({ subject: null, fromEmail: null, fromName: null }),
    });

    expect(resolved).toMatchObject({
      subject: "Invoice INV-100",
      fromEmail: "billing@carrier.com",
      fromName: "Carrier Billing",
    });
  });

  it("keeps the body pair from one source", () => {
    // A message with only text must not borrow the snapshot html: the pair
    // would then describe two different revisions of the email.
    const resolved = resolveInvoiceSourceEmail({
      invoice: emailInvoice(),
      message: mailboxMessage({ bodyHtml: null, bodyText: "Mailbox body" }),
    });

    expect(resolved?.bodyHtml).toBeNull();
    expect(resolved?.bodyText).toBe("Mailbox body");
  });

  it("uses the snapshot body when the message has none", () => {
    const resolved = resolveInvoiceSourceEmail({
      invoice: emailInvoice(),
      message: mailboxMessage({ bodyHtml: null, bodyText: null }),
    });

    expect(resolved?.bodyHtml).toBe("<p>Snapshot body</p>");
    expect(resolved?.bodyText).toBe("Snapshot body");
  });

  it("returns null when there is nothing to show", () => {
    expect(
      resolveInvoiceSourceEmail({
        invoice: emailInvoice({
          emailSubject: null,
          emailFrom: null,
          emailFromName: null,
          emailBodyHtml: null,
          emailBodyText: null,
        }),
        message: null,
      }),
    ).toBeNull();
  });
});
