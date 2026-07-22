import { describe, expect, it } from "vitest";
import { createCreditRequest, recordCreditRequestOutcome } from "@/lib/credit-lines";
import { markCreditRequestSubmitted } from "@/lib/credit-requests";
import { db, invoices, organizations, users } from "@/lib/db";

async function seedCreditRequest(
  slug: string,
  requestedAmount = 100,
  /** Lets a caller store a total that disagrees with the lines. */
  requestedTotal?: number | null,
) {
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

  const outcome = await createCreditRequest({
    organizationId: org.id,
    userId: user.id,
    invoiceId: invoice.id,
    lines: [{ requestedAmount, reason: "SERVICE_DOWNGRADE" }],
    requestedTotal,
  });
  if ("error" in outcome) throw new Error(outcome.error);

  return { org, user, invoice, creditRequest: outcome.creditRequest };
}

describe("credit request lifecycle", () => {
  it("starts pending — nothing has been sent to the carrier yet", async () => {
    const { creditRequest } = await seedCreditRequest("status-new");
    expect(creditRequest.status).toBe("PENDING");
    expect(creditRequest.submittedAt).toBeNull();
  });

  it("marks a pending request submitted and stamps when it went out", async () => {
    const { org, user, creditRequest } = await seedCreditRequest("status-submit");

    const result = await markCreditRequestSubmitted({
      organizationId: org.id,
      userId: user.id,
      creditRequestId: creditRequest.id,
    });

    expect("error" in result).toBe(false);
    expect(result.creditRequest?.status).toBe("SUBMITTED");
    expect(result.creditRequest?.submittedAt).toBeInstanceOf(Date);
  });

  it("will not re-submit a request that already has an outcome", async () => {
    const { org, user, creditRequest } = await seedCreditRequest("status-resubmit");

    await recordCreditRequestOutcome({
      organizationId: org.id,
      userId: user.id,
      creditRequestId: creditRequest.id,
      outcome: "denied",
    });

    const result = await markCreditRequestSubmitted({
      organizationId: org.id,
      userId: user.id,
      creditRequestId: creditRequest.id,
    });

    expect(result).toMatchObject({
      error: "Only a pending credit request can be marked submitted",
    });
  });

  it("records a full approval when the carrier grants the requested total", async () => {
    const { org, user, creditRequest } = await seedCreditRequest("status-full", 100);

    const result = await recordCreditRequestOutcome({
      organizationId: org.id,
      userId: user.id,
      creditRequestId: creditRequest.id,
      outcome: "approved",
      approvedAmount: 100,
    });

    expect(result).toMatchObject({ creditRequest: { status: "APPROVED" } });
  });

  it("records a partial approval when the carrier grants less than requested", async () => {
    const { org, user, creditRequest } = await seedCreditRequest("status-partial", 100);

    const result = await recordCreditRequestOutcome({
      organizationId: org.id,
      userId: user.id,
      creditRequestId: creditRequest.id,
      outcome: "approved",
      approvedAmount: 60,
    });

    expect(result).toMatchObject({
      creditRequest: { status: "PARTIALLY_APPROVED", approvedAmount: 60 },
    });
  });

  it("falls back to the lines when the stored total is zero, matching the dialog", async () => {
    // The outcome dialog resolves its benchmark the same way, so a stored zero
    // must not quietly make every approval look full.
    const { org, user, creditRequest } = await seedCreditRequest("status-zero", 100, 0);
    expect(creditRequest.requestedTotal).toBe(0);

    const result = await recordCreditRequestOutcome({
      organizationId: org.id,
      userId: user.id,
      creditRequestId: creditRequest.id,
      outcome: "approved",
      approvedAmount: 60,
    });

    expect(result).toMatchObject({ creditRequest: { status: "PARTIALLY_APPROVED" } });
  });

  it("defaults an unspecified approved amount to the full request", async () => {
    const { org, user, creditRequest } = await seedCreditRequest("status-default", 100);

    const result = await recordCreditRequestOutcome({
      organizationId: org.id,
      userId: user.id,
      creditRequestId: creditRequest.id,
      outcome: "approved",
    });

    expect(result).toMatchObject({
      creditRequest: { status: "APPROVED", approvedAmount: 100 },
    });
  });

  it("rejects with no approved amount", async () => {
    const { org, user, creditRequest } = await seedCreditRequest("status-reject");

    const result = await recordCreditRequestOutcome({
      organizationId: org.id,
      userId: user.id,
      creditRequestId: creditRequest.id,
      outcome: "denied",
    });

    expect(result).toMatchObject({
      creditRequest: { status: "REJECTED", approvedAmount: null },
    });
  });
});
