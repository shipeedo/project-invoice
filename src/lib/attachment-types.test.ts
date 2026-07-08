import { describe, expect, it } from "vitest";
import {
  classifyAttachment,
  countInvoiceLikeAttachments,
  isCsvAttachment,
  isInvoiceLikeAttachment,
  isPdfAttachment,
  pickPrimaryInvoiceAttachment,
  resolveAttachmentContentType,
} from "@/lib/attachment-types";

describe("classifyAttachment", () => {
  it("detects common invoice file types", () => {
    expect(classifyAttachment("invoice.pdf", "application/pdf")).toBe("pdf");
    expect(classifyAttachment("lines.csv", "text/csv")).toBe("csv");
    expect(
      classifyAttachment(
        "invoice.xlsx",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      ),
    ).toBe("xlsx");
    expect(classifyAttachment("invoice.docx", "application/octet-stream")).toBe("docx");
  });

  it("does not treat plain text or images as invoice attachments", () => {
    expect(classifyAttachment("notes.txt", "text/plain")).toBe("unknown");
    expect(classifyAttachment("logo.png", "image/png")).toBe("unknown");
  });
});

describe("pickPrimaryInvoiceAttachment", () => {
  it("prefers pdf over spreadsheet and word attachments", () => {
    const attachments = [
      { fileName: "invoice.xlsx", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" },
      { fileName: "invoice.pdf", mimeType: "application/pdf" },
      { fileName: "invoice.docx", mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" },
    ];

    expect(pickPrimaryInvoiceAttachment(attachments)?.attachment.fileName).toBe("invoice.pdf");
  });

  it("falls back to xlsx when no pdf is present", () => {
    const attachments = [
      { fileName: "invoice.docx", mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" },
      { fileName: "invoice.xlsx", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" },
    ];

    expect(pickPrimaryInvoiceAttachment(attachments)?.kind).toBe("xlsx");
  });
});

describe("invoice-like helpers", () => {
  it("counts only supported invoice attachments", () => {
    expect(
      countInvoiceLikeAttachments([
        { fileName: "invoice.xlsx", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" },
        { fileName: "signature.png", mimeType: "image/png" },
      ]),
    ).toBe(1);
  });

  it("does not classify plain text as csv", () => {
    expect(isCsvAttachment("notes.txt", "text/plain")).toBe(false);
    expect(isCsvAttachment("lines.csv", "text/plain")).toBe(true);
  });

  it("detects pdf by extension even with generic mime type", () => {
    expect(isPdfAttachment("invoice.pdf", "application/octet-stream")).toBe(true);
    expect(isInvoiceLikeAttachment("invoice.xlsx", "application/octet-stream")).toBe(true);
  });
});

describe("resolveAttachmentContentType", () => {
  it("serves the canonical type for known kinds over a generic stored mime", () => {
    expect(resolveAttachmentContentType("invoice.pdf", "application/octet-stream")).toBe(
      "application/pdf",
    );
    expect(resolveAttachmentContentType("charges.csv", "application/octet")).toBe(
      "text/csv",
    );
  });

  it("falls back to the stored mime for unknown kinds", () => {
    expect(resolveAttachmentContentType("photo.png", "image/png")).toBe("image/png");
    expect(resolveAttachmentContentType("mystery.bin", null)).toBe(
      "application/octet-stream",
    );
  });
});
