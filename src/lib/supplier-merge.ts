import { and, eq } from "drizzle-orm";
import {
  db,
  emailContacts,
  emailThreads,
  invoices,
  mailboxMessages,
  notes,
  routingRules,
  suppliers,
  type Supplier,
} from "@/lib/db";

// Everything that gets relinked from the duplicate onto the surviving supplier.
export type SupplierMergeCounts = {
  invoices: number;
  notes: number;
  emailThreads: number;
  mailboxMessages: number;
  emailContacts: number;
  routingRules: number;
};

export type SupplierMergeResult =
  | { error: "same_supplier" | "not_found" }
  | { source: Supplier; target: Supplier; counts: SupplierMergeCounts };

function parseStringList(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed)
      ? parsed.filter((value): value is string => typeof value === "string")
      : [];
  } catch {
    return [];
  }
}

function unionValues(target: string[], source: string[]): string[] {
  const seen = new Set(target.map((value) => value.toLowerCase()));
  const merged = [...target];
  for (const value of source) {
    const key = value.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(value);
  }
  return merged;
}

/**
 * Rewrites supplier references inside a routing rule condition in place, so
 * rules pointing at the duplicate keep working against the survivor. Handles
 * both the legacy single-condition shape and COMBO's `conditions` array.
 * Returns true when anything was rewritten.
 */
function repointSupplierConditions(
  value: unknown,
  sourceId: string,
  targetId: string,
  targetName: string,
): boolean {
  if (Array.isArray(value)) {
    let changed = false;
    for (const entry of value) {
      if (repointSupplierConditions(entry, sourceId, targetId, targetName)) changed = true;
    }
    return changed;
  }

  if (!value || typeof value !== "object") return false;

  const record = value as Record<string, unknown>;
  let changed = false;

  if (record.supplierId === sourceId) {
    record.supplierId = targetId;
    if ("supplierName" in record) record.supplierName = targetName;
    changed = true;
  }

  if (repointSupplierConditions(record.conditions, sourceId, targetId, targetName)) {
    changed = true;
  }

  return changed;
}

function describeMerge(sourceName: string, counts: SupplierMergeCounts): string {
  const moved = [
    counts.invoices > 0 ? `${counts.invoices} invoice${counts.invoices === 1 ? "" : "s"}` : null,
    counts.mailboxMessages > 0
      ? `${counts.mailboxMessages} email${counts.mailboxMessages === 1 ? "" : "s"}`
      : null,
    counts.notes > 0 ? `${counts.notes} note${counts.notes === 1 ? "" : "s"}` : null,
    counts.routingRules > 0
      ? `${counts.routingRules} routing rule${counts.routingRules === 1 ? "" : "s"}`
      : null,
  ].filter(Boolean);

  const detail = moved.length > 0 ? ` ${moved.join(", ")} moved across.` : "";
  return `Merged duplicate supplier "${sourceName}" into this supplier.${detail}`;
}

function findSupplier(id: string, organizationId: string) {
  return db.query.suppliers.findFirst({
    where: and(eq(suppliers.id, id), eq(suppliers.organizationId, organizationId)),
  });
}

/**
 * Moves every record linked to `sourceId` onto `targetId`, folds the
 * duplicate's email addresses/domains into the survivor, then deletes the
 * duplicate. The survivor keeps its own trading terms and extraction prompt
 * unless it has none, in which case it adopts the duplicate's.
 */
export async function mergeSuppliers(params: {
  sourceId: string;
  targetId: string;
  organizationId: string;
  userId: string;
}): Promise<SupplierMergeResult> {
  if (params.sourceId === params.targetId) {
    return { error: "same_supplier" };
  }

  const [source, target] = await Promise.all([
    findSupplier(params.sourceId, params.organizationId),
    findSupplier(params.targetId, params.organizationId),
  ]);

  if (!source || !target) {
    return { error: "not_found" };
  }

  const orgRules = await db.query.routingRules.findMany({
    where: eq(routingRules.organizationId, params.organizationId),
  });

  const ruleUpdates: Array<{ id: string; condition: string }> = [];
  for (const rule of orgRules) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(rule.condition);
    } catch {
      continue;
    }
    if (repointSupplierConditions(parsed, source.id, target.id, target.name)) {
      ruleUpdates.push({ id: rule.id, condition: JSON.stringify(parsed) });
    }
  }

  const emailAddresses = unionValues(
    parseStringList(target.emailAddresses),
    parseStringList(source.emailAddresses),
  );
  const emailDomains = unionValues(
    parseStringList(target.emailDomains),
    parseStringList(source.emailDomains),
  );

  const counts = db.transaction((tx) => {
    const moved: SupplierMergeCounts = {
      invoices: tx
        .update(invoices)
        .set({ supplierId: target.id })
        .where(eq(invoices.supplierId, source.id))
        .run().changes,
      notes: tx
        .update(notes)
        .set({ supplierId: target.id })
        .where(eq(notes.supplierId, source.id))
        .run().changes,
      emailThreads: tx
        .update(emailThreads)
        .set({ supplierId: target.id })
        .where(eq(emailThreads.supplierId, source.id))
        .run().changes,
      mailboxMessages: tx
        .update(mailboxMessages)
        .set({ supplierId: target.id })
        .where(eq(mailboxMessages.supplierId, source.id))
        .run().changes,
      emailContacts: tx
        .update(emailContacts)
        .set({ supplierId: target.id })
        .where(eq(emailContacts.supplierId, source.id))
        .run().changes,
      routingRules: ruleUpdates.length,
    };

    for (const update of ruleUpdates) {
      tx.update(routingRules)
        .set({ condition: update.condition })
        .where(eq(routingRules.id, update.id))
        .run();
    }

    tx.update(suppliers)
      .set({
        emailAddresses: JSON.stringify(emailAddresses),
        emailDomains: JSON.stringify(emailDomains),
        tradingTermDays: target.tradingTermDays ?? source.tradingTermDays,
        extractionPrompt: target.extractionPrompt ?? source.extractionPrompt,
      })
      .where(eq(suppliers.id, target.id))
      .run();

    tx.insert(notes)
      .values({
        supplierId: target.id,
        userId: params.userId,
        content: describeMerge(source.name, moved),
      })
      .run();

    tx.delete(suppliers).where(eq(suppliers.id, source.id)).run();

    return moved;
  });

  return { source, target, counts };
}
