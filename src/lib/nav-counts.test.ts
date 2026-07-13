import { describe, expect, it } from "vitest";
import { getNavCounts } from "@/lib/nav-counts";

describe("nav counts", () => {
  it("returns zero counts for an unknown organization", async () => {
    await expect(getNavCounts("org_missing", "user_missing")).resolves.toEqual({
      invoices: 0,
      inbox: 0,
      trash: 0,
      credits: 0,
      processing: 0,
      invoiceFilters: {
        assignedToMe: 0,
        overdue: 0,
        dueTomorrow: 0,
        draft: 0,
        pending: 0,
        approved: 0,
        all: 0,
      },
    });
  });
});
