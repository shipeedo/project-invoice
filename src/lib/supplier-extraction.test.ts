import { describe, expect, it } from "vitest";
import type { Supplier } from "@/lib/db";
import { supplierMatchesInvoiceFields } from "@/lib/supplier-extraction";

function supplier(overrides: Partial<Supplier> = {}): Supplier {
  return {
    id: "supplier-1",
    organizationId: "org-1",
    name: "CartonCloud Pty Ltd",
    emailAddresses: JSON.stringify(["accounts@cartoncloud.com"]),
    emailDomains: JSON.stringify(["cartoncloud.com"]),
    tradingTermDays: null,
    extractionPrompt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as Supplier;
}

describe("supplierMatchesInvoiceFields", () => {
  it("matches on name regardless of case and spacing", () => {
    expect(supplierMatchesInvoiceFields(supplier(), "  cartoncloud   pty ltd ")).toBe(
      true,
    );
  });

  it("matches on a known email address or its domain", () => {
    expect(
      supplierMatchesInvoiceFields(supplier(), "Someone Else", "ACCOUNTS@cartoncloud.com"),
    ).toBe(true);
    expect(
      supplierMatchesInvoiceFields(supplier(), "Someone Else", "billing@cartoncloud.com"),
    ).toBe(true);
  });

  it("keeps a link when only the trading name changed", () => {
    // The case that must not detach: a renamed supplier still reachable on its
    // own domain stays linked.
    expect(
      supplierMatchesInvoiceFields(
        supplier(),
        "CartonCloud (AU)",
        "accounts@cartoncloud.com",
      ),
    ).toBe(true);
  });

  it("rejects a supplier that matches neither field", () => {
    // The production case: both the name and the email moved to another company.
    expect(
      supplierMatchesInvoiceFields(
        supplier(),
        "Snapes Project Logistics",
        "accounts@snapes.com.au",
      ),
    ).toBe(false);
  });

  it("does not match on absent fields", () => {
    expect(supplierMatchesInvoiceFields(supplier(), null, null)).toBe(false);
    expect(supplierMatchesInvoiceFields(supplier(), "", "")).toBe(false);
  });

  it("does not treat a bare domain-less address as a domain match", () => {
    expect(supplierMatchesInvoiceFields(supplier(), "Other", "cartoncloud.com")).toBe(
      false,
    );
  });
});
