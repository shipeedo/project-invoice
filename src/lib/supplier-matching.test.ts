import { describe, expect, it } from "vitest";
import {
  rankSupplierMatches,
  type SupplierMatchTarget,
} from "@/lib/supplier-matching";

const CARTONCLOUD: SupplierMatchTarget = {
  id: "supplier-cartoncloud",
  name: "CartonCloud Pty Ltd",
  emailAddresses: ["accounts@cartoncloud.com"],
  emailDomains: ["cartoncloud.com"],
};

const SNAPES: SupplierMatchTarget = {
  id: "supplier-snapes",
  name: "Snapes Project Logistics",
  emailAddresses: [],
  emailDomains: ["snapes.com.au"],
};

const SYDNEY_COURIERS: SupplierMatchTarget = {
  id: "supplier-sydney",
  name: "Sydney Couriers",
  emailAddresses: [],
  emailDomains: [],
};

const ALL = [CARTONCLOUD, SNAPES, SYDNEY_COURIERS];

describe("rankSupplierMatches", () => {
  it("returns nothing when there is nothing to match on", () => {
    expect(rankSupplierMatches(ALL, { name: "", email: null })).toEqual([]);
  });

  it("matches an exact billing address ahead of everything else", () => {
    const [top] = rankSupplierMatches(ALL, {
      name: "Something Unrelated",
      email: "ACCOUNTS@CartonCloud.com",
    });

    expect(top.supplierId).toBe("supplier-cartoncloud");
    expect(top.reason).toBe("email");
  });

  it("matches on the sending domain when the address itself is unknown", () => {
    const [top] = rankSupplierMatches(ALL, {
      name: "Snapes",
      email: "billing@snapes.com.au",
    });

    expect(top.supplierId).toBe("supplier-snapes");
    expect(top.reason).toBe("domain");
  });

  it("matches on name alone when no email was extracted", () => {
    const [top] = rankSupplierMatches(ALL, { name: "  cartoncloud   PTY LTD " });

    expect(top.supplierId).toBe("supplier-cartoncloud");
    expect(top.reason).toBe("name");
  });

  it("offers a near match when only the company suffix differs", () => {
    // The case that used to create a duplicate: the invoice names the business
    // without the registration suffix the supplier record carries.
    const [top] = rankSupplierMatches(ALL, { name: "CartonCloud" });

    expect(top.supplierId).toBe("supplier-cartoncloud");
    expect(top.reason).toBe("similar_name");
    expect(top.confidence).toBe("medium");
  });

  it("offers a near match on a partly reworded name", () => {
    const [top] = rankSupplierMatches(ALL, { name: "Snapes Project Logistics Group" });

    expect(top.supplierId).toBe("supplier-snapes");
    expect(top.reason).toBe("similar_name");
  });

  it("does not match two businesses that merely share a common word", () => {
    expect(rankSupplierMatches(ALL, { name: "Sydney Freight Services" })).toEqual([]);
  });

  it("keeps only the strongest reason per supplier", () => {
    const matches = rankSupplierMatches(ALL, {
      name: "CartonCloud Pty Ltd",
      email: "accounts@cartoncloud.com",
    });

    expect(matches).toHaveLength(1);
    expect(matches[0].reason).toBe("email");
  });

  it("ranks a domain match above a similarly named supplier", () => {
    const rebranded: SupplierMatchTarget = {
      id: "supplier-rebranded",
      name: "Snapes Project Logistics AU",
      emailAddresses: [],
      emailDomains: [],
    };

    const matches = rankSupplierMatches([rebranded, SNAPES], {
      name: "Snapes Project Logistics",
      email: "accounts@snapes.com.au",
    });

    expect(matches.map((match) => match.supplierId)).toEqual([
      "supplier-snapes",
      "supplier-rebranded",
    ]);
  });
});
