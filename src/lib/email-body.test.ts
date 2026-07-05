import { describe, expect, it } from "vitest";
import {
  extractReferencedCompanyFromEmail,
  getEmbeddedSenderFromForwardedBody,
  isForwardedEmailBody,
  splitEmailThread,
} from "./email-body";

describe("splitEmailThread", () => {
  it("splits Outlook forwarded messages", () => {
    const body = `Hi AP team, please process this invoice.

-----Original Message-----
From: Accounts <billing@couriersplease.com>
Sent: Monday, 1 July 2025 9:15 AM
To: Jane Smith <jane@ourcompany.com>
Subject: Tax Invoice #12345

Please find attached your invoice for July.`;

    const parts = splitEmailThread(body);

    expect(parts).toHaveLength(2);
    expect(parts[0]).toMatchObject({
      source: "wrapper",
      fromEmail: null,
      body: expect.stringContaining("Hi AP team"),
    });
    expect(parts[1]).toMatchObject({
      source: "forwarded",
      fromName: "Accounts",
      fromEmail: "billing@couriersplease.com",
      subject: "Tax Invoice #12345",
      body: expect.stringContaining("Please find attached"),
    });
  });

  it("splits Gmail forwarded messages", () => {
    const body = `FYI

---------- Forwarded message ---------
From: Billing <billing@supplier.com>
Date: Tue, 2 Jul 2025 at 10:00
Subject: Invoice 999
To: ops@ourcompany.com

Invoice details here.`;

    const parts = splitEmailThread(body);

    expect(parts).toHaveLength(2);
    expect(parts[1]).toMatchObject({
      fromEmail: "billing@supplier.com",
      subject: "Invoice 999",
    });
  });

  it("handles nested forwards and returns the innermost sender", () => {
    const body = `Please process.

-----Original Message-----
From: Jane Smith <jane@ourcompany.com>
Sent: Tuesday, 2 July 2025 10:00 AM
To: AP <ap@ourcompany.com>
Subject: Fwd: Invoice

See below.

-----Original Message-----
From: Accounts <billing@couriersplease.com>
Sent: Monday, 1 July 2025 9:15 AM
To: Jane Smith <jane@ourcompany.com>
Subject: Tax Invoice #12345

Original invoice body.`;

    const parts = splitEmailThread(body);
    expect(parts.length).toBeGreaterThanOrEqual(3);

    const embedded = getEmbeddedSenderFromForwardedBody(body);
    expect(embedded).toMatchObject({
      fromEmail: "billing@couriersplease.com",
      fromName: "Accounts",
    });
  });

  it("returns a single part for direct supplier emails", () => {
    const body = "Please find attached invoice INV-001.";

    expect(isForwardedEmailBody(body)).toBe(false);
    expect(splitEmailThread(body)).toEqual([
      expect.objectContaining({
        source: "wrapper",
        body,
      }),
    ]);
  });

  it("splits dashed reply lines used by some Outlook clients", () => {
    const body = `Please see below.

---- on Wed, 01 Jul 2026 16:04:08 +1000 Carrier Invoices<ci@couriersandfreight.com.au> wrote ----

Reference Number: CC2900
Claimant: Freightonline Supply Chain & Logistics Pty Ltd`;

    const parts = splitEmailThread(body);

    expect(parts).toHaveLength(2);
    expect(parts[1]).toMatchObject({
      source: "reply",
      fromEmail: "ci@couriersandfreight.com.au",
      fromName: "Carrier Invoices",
      body: expect.stringContaining("Reference Number: CC2900"),
    });
  });

  it("extracts referenced company names from credit claim content", () => {
    const company = extractReferencedCompanyFromEmail({
      subject:
        "Re: Re:[## CRL-CC-6063 ##] Credit Claim - CC2900 - Freightonline Supply Chain & Logistics Pty Ltd Consignment No - FRPO000645",
      body: "Claimant: Freightonline Supply Chain & Logistics Pty Ltd",
    });

    expect(company).toBe(
      "Freightonline Supply Chain & Logistics Pty Ltd",
    );
  });
});
