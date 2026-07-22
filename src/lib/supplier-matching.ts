/**
 * Ranks existing suppliers against the supplier name/email confirmed on a
 * draft invoice, so linking an invoice always offers the matches first and
 * only falls back to creating a new record.
 *
 * Deliberately free of database imports: the draft screen re-ranks on every
 * keystroke in the browser using the same rules the server applies when it
 * resolves the link.
 */

export type SupplierMatchTarget = {
  id: string;
  name: string;
  emailAddresses: string[];
  emailDomains: string[];
};

export type SupplierMatchReason = "email" | "domain" | "name" | "similar_name";

/** Suppliers store their addresses and domains as JSON text columns. */
export function toSupplierMatchTarget(supplier: {
  id: string;
  name: string;
  emailAddresses: string;
  emailDomains: string;
}): SupplierMatchTarget {
  const parse = (value: string) => {
    try {
      const parsed = JSON.parse(value) as unknown;
      return Array.isArray(parsed)
        ? parsed.filter((entry): entry is string => typeof entry === "string")
        : [];
    } catch {
      return [];
    }
  };

  return {
    id: supplier.id,
    name: supplier.name,
    emailAddresses: parse(supplier.emailAddresses),
    emailDomains: parse(supplier.emailDomains),
  };
}

export type SupplierMatch = {
  supplierId: string;
  name: string;
  reason: SupplierMatchReason;
  confidence: "high" | "medium" | "low";
  detail: string;
};

/** Words that differ between how a supplier trades and how it is registered,
 * and so should not stop "Acme Freight" matching "Acme Freight Pty Ltd". */
const COMPANY_SUFFIXES = new Set([
  "pty",
  "ptyltd",
  "ltd",
  "limited",
  "inc",
  "incorporated",
  "llc",
  "co",
  "company",
  "corp",
  "corporation",
  "group",
  "holdings",
  "australia",
  "aus",
  "au",
  "nz",
  "international",
  "the",
  "and",
]);

/** Least-common-denominator comparison: only case and whitespace are ignored,
 * so two names equal under it are the same name. */
export function normalizeForMatch(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function tokenize(value: string) {
  return normalizeForMatch(value)
    .replace(/[^a-z0-9 ]+/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

/** Tokens that carry the identity of the business, with registration noise
 * stripped — unless stripping leaves nothing (e.g. "The Group"). */
function identityTokens(value: string) {
  const tokens = tokenize(value);
  const stripped = tokens.filter((token) => !COMPANY_SUFFIXES.has(token));
  return stripped.length > 0 ? stripped : tokens;
}

/** Dice coefficient over the identity tokens: 1 when the sets are equal, 0
 * when they are disjoint. */
function tokenSimilarity(a: string, b: string) {
  const left = new Set(identityTokens(a));
  const right = new Set(identityTokens(b));
  if (left.size === 0 || right.size === 0) return 0;

  let shared = 0;
  for (const token of left) {
    if (right.has(token)) shared += 1;
  }
  return (2 * shared) / (left.size + right.size);
}

/** Below this the names share a word by coincidence ("Sydney Freight" vs
 * "Sydney Couriers") rather than naming the same business. */
const SIMILAR_NAME_THRESHOLD = 0.6;

export function emailDomain(email: string | null | undefined) {
  if (!email) return "";
  return email.split("@")[1]?.trim().toLowerCase() ?? "";
}

function matchOn(
  supplier: SupplierMatchTarget,
  name: string,
  email: string,
): SupplierMatch | null {
  const normalizedEmail = email.trim().toLowerCase();
  const normalizedName = normalizeForMatch(name);

  if (normalizedEmail) {
    const address = supplier.emailAddresses.find(
      (entry) => entry.trim().toLowerCase() === normalizedEmail,
    );
    if (address) {
      return {
        supplierId: supplier.id,
        name: supplier.name,
        reason: "email",
        confidence: "high",
        detail: `Billing email ${address}`,
      };
    }
  }

  const domain = emailDomain(normalizedEmail);
  if (domain) {
    const known = supplier.emailDomains.find(
      (entry) => entry.trim().toLowerCase() === domain,
    );
    if (known) {
      return {
        supplierId: supplier.id,
        name: supplier.name,
        reason: "domain",
        confidence: "high",
        detail: `Sends from ${known}`,
      };
    }
  }

  if (normalizedName) {
    if (normalizeForMatch(supplier.name) === normalizedName) {
      return {
        supplierId: supplier.id,
        name: supplier.name,
        reason: "name",
        confidence: "high",
        detail: "Same supplier name",
      };
    }

    const similarity = tokenSimilarity(supplier.name, normalizedName);
    if (similarity >= SIMILAR_NAME_THRESHOLD) {
      return {
        supplierId: supplier.id,
        name: supplier.name,
        reason: "similar_name",
        confidence: similarity === 1 ? "medium" : "low",
        detail:
          similarity === 1
            ? "Same name apart from its company suffix"
            : "Similar supplier name",
      };
    }
  }

  return null;
}

/** Mirrors findMatchingSupplier's precedence so the match offered on screen is
 * the one the server would resolve to on its own. */
const REASON_RANK: Record<SupplierMatchReason, number> = {
  email: 0,
  domain: 1,
  name: 2,
  similar_name: 3,
};

export function rankSupplierMatches(
  suppliers: SupplierMatchTarget[],
  fields: { name?: string | null; email?: string | null },
  limit = 5,
): SupplierMatch[] {
  const name = fields.name?.trim() ?? "";
  const email = fields.email?.trim() ?? "";
  if (!name && !email) return [];

  return suppliers
    .map((supplier) => matchOn(supplier, name, email))
    .filter((match): match is SupplierMatch => match !== null)
    .sort(
      (a, b) =>
        REASON_RANK[a.reason] - REASON_RANK[b.reason] || a.name.localeCompare(b.name),
    )
    .slice(0, limit);
}
