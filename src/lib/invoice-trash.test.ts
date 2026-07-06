import { describe, expect, it } from "vitest";
import {
  TRASH_RETENTION_DAYS,
  daysUntilTrashExpiry,
  isInvoiceDeleted,
  isInvoiceVisibleInTrash,
  trashRetentionCutoff,
} from "@/lib/invoice-trash";

describe("invoice trash helpers", () => {
  const now = new Date("2026-07-06T12:00:00.000Z").getTime();

  it("treats invoices with deletedAt as deleted", () => {
    expect(isInvoiceDeleted({ deletedAt: new Date(now) })).toBe(true);
    expect(isInvoiceDeleted({ deletedAt: null })).toBe(false);
  });

  it("keeps invoices visible in trash for 30 days", () => {
    const deletedAt = new Date(now - 10 * 24 * 60 * 60 * 1000);
    expect(isInvoiceVisibleInTrash(deletedAt, now)).toBe(true);
    expect(daysUntilTrashExpiry(deletedAt, now)).toBe(20);
  });

  it("hides invoices after the retention window", () => {
    const deletedAt = new Date(trashRetentionCutoff(now).getTime() - 1);
    expect(isInvoiceVisibleInTrash(deletedAt, now)).toBe(false);
    expect(daysUntilTrashExpiry(deletedAt, now)).toBe(0);
  });

  it("computes the retention cutoff from now", () => {
    const cutoff = trashRetentionCutoff(now);
    expect(cutoff.getTime()).toBe(now - TRASH_RETENTION_DAYS * 24 * 60 * 60 * 1000);
  });
});
