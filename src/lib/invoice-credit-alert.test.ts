import { describe, expect, it } from "vitest";
import { getInvoiceCreditAlert } from "@/lib/invoice-credit-alert";

describe("getInvoiceCreditAlert", () => {
  it("warns when an approved invoice has an open credit", () => {
    expect(
      getInvoiceCreditAlert({ status: "APPROVED", creditStatuses: ["SENT"] }),
    ).toMatchObject({ label: "Credit pending" });
  });

  it("warns when the carrier granted a credit that still has to be applied", () => {
    expect(
      getInvoiceCreditAlert({ status: "APPROVED", creditStatuses: ["APPROVED"] }),
    ).toMatchObject({ label: "Credit to apply" });
  });

  it("prefers the granted-credit warning when both exist", () => {
    expect(
      getInvoiceCreditAlert({
        status: "APPROVED",
        creditStatuses: ["SENT", "APPROVED"],
      }),
    ).toMatchObject({ label: "Credit to apply" });
  });

  it("stays silent once every credit is rejected", () => {
    expect(
      getInvoiceCreditAlert({
        status: "APPROVED",
        creditStatuses: ["REJECTED", "REJECTED"],
      }),
    ).toBeNull();
  });

  it("stays silent when the invoice has no credits", () => {
    expect(
      getInvoiceCreditAlert({ status: "APPROVED", creditStatuses: [] }),
    ).toBeNull();
  });

  it("only applies to approved invoices — payment is not imminent otherwise", () => {
    expect(
      getInvoiceCreditAlert({
        status: "PENDING_APPROVAL",
        creditStatuses: ["SENT"],
      }),
    ).toBeNull();
  });
});
