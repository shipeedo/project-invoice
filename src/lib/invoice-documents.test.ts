import { describe, expect, it } from "vitest";
import {
  DOCUMENT_UPLOAD_EXTENSIONS,
  REBILL_UPLOAD_EXTENSIONS,
  documentKindLabel,
  formatFileSize,
  hasAllowedExtension,
} from "@/lib/invoice-documents";

describe("hasAllowedExtension", () => {
  it("accepts allowed extensions regardless of case", () => {
    expect(hasAllowedExtension("credit.PDF", DOCUMENT_UPLOAD_EXTENSIONS)).toBe(true);
    expect(hasAllowedExtension("photo.JpEg", DOCUMENT_UPLOAD_EXTENSIONS)).toBe(true);
    expect(hasAllowedExtension("sheet.xlsx", REBILL_UPLOAD_EXTENSIONS)).toBe(true);
  });

  it("rejects extensions outside the allow list", () => {
    expect(hasAllowedExtension("malware.exe", DOCUMENT_UPLOAD_EXTENSIONS)).toBe(false);
    expect(hasAllowedExtension("archive.zip", REBILL_UPLOAD_EXTENSIONS)).toBe(false);
    // Images are fine for general documents but not for rebills.
    expect(hasAllowedExtension("scan.png", REBILL_UPLOAD_EXTENSIONS)).toBe(false);
  });

  it("does not match extension-like substrings mid-name", () => {
    expect(hasAllowedExtension("report.pdf.exe", DOCUMENT_UPLOAD_EXTENSIONS)).toBe(false);
  });
});

describe("formatFileSize", () => {
  it("handles missing values", () => {
    expect(formatFileSize(null)).toBe("—");
    expect(formatFileSize(undefined)).toBe("—");
    expect(formatFileSize(-5)).toBe("—");
  });

  it("formats bytes, kilobytes, and megabytes", () => {
    expect(formatFileSize(512)).toBe("512 B");
    expect(formatFileSize(2048)).toBe("2.0 KB");
    expect(formatFileSize(150 * 1024)).toBe("150 KB");
    expect(formatFileSize(3 * 1024 * 1024)).toBe("3.0 MB");
    expect(formatFileSize(25 * 1024 * 1024)).toBe("25 MB");
  });
});

describe("documentKindLabel", () => {
  it("maps kinds to user-facing labels", () => {
    expect(documentKindLabel("GENERAL")).toBe("General");
    expect(documentKindLabel("REBILL")).toBe("Rebill");
    expect(documentKindLabel("CREDIT")).toBe("Credit");
    expect(documentKindLabel("UNKNOWN")).toBe("General");
  });
});
