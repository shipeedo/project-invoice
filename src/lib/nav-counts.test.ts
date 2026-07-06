import { describe, expect, it } from "vitest";
import { getNavCounts } from "@/lib/nav-counts";

describe("nav counts", () => {
  it("returns zero counts for an unknown organization", async () => {
    await expect(getNavCounts("org_missing")).resolves.toEqual({
      invoices: 0,
      inbox: 0,
      trash: 0,
      credits: 0,
    });
  });
});
