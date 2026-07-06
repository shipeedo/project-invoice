import { and, eq, gte, isNotNull, isNull } from "drizzle-orm";
import { recordAuditEvent } from "@/lib/audit";
import {
  db,
  invoices,
  mailboxMessages,
  notes,
  processedO365Messages,
} from "@/lib/db";

export const TRASH_RETENTION_DAYS = 30;
export const TRASH_RETENTION_MS = TRASH_RETENTION_DAYS * 24 * 60 * 60 * 1000;

export function trashRetentionCutoff(now = Date.now()) {
  return new Date(now - TRASH_RETENTION_MS);
}

export function invoiceNotDeleted() {
  return isNull(invoices.deletedAt);
}

export function invoiceInVisibleTrash(now = Date.now()) {
  return and(isNotNull(invoices.deletedAt), gte(invoices.deletedAt, trashRetentionCutoff(now)));
}

export function isInvoiceDeleted(invoice: { deletedAt: Date | null | undefined }) {
  return invoice.deletedAt != null;
}

export function isInvoiceVisibleInTrash(
  deletedAt: Date | null | undefined,
  now = Date.now(),
) {
  if (!deletedAt) return false;
  return deletedAt.getTime() >= trashRetentionCutoff(now).getTime();
}

export function daysUntilTrashExpiry(deletedAt: Date, now = Date.now()) {
  const expiresAt = deletedAt.getTime() + TRASH_RETENTION_MS;
  return Math.max(0, Math.ceil((expiresAt - now) / (24 * 60 * 60 * 1000)));
}

export async function softDeleteInvoice(params: {
  invoiceId: string;
  organizationId: string;
  userId: string;
  reason?: string | null;
}) {
  const invoice = await db.query.invoices.findFirst({
    where: and(
      eq(invoices.id, params.invoiceId),
      eq(invoices.organizationId, params.organizationId),
    ),
  });

  if (!invoice) {
    return { error: "not_found" as const };
  }

  if (isInvoiceDeleted(invoice)) {
    return { error: "already_deleted" as const };
  }

  const reason = params.reason?.trim() || null;
  const deletedAt = new Date();

  const updated = db.transaction((tx) => {
    if (reason) {
      tx.insert(notes)
        .values({
          invoiceId: params.invoiceId,
          userId: params.userId,
          content: `Moved to trash: ${reason}`,
        })
        .run();
    }

    tx.update(mailboxMessages)
      .set({ invoiceId: null })
      .where(eq(mailboxMessages.invoiceId, params.invoiceId))
      .run();

    tx.delete(processedO365Messages)
      .where(eq(processedO365Messages.invoiceId, params.invoiceId))
      .run();

    return tx
      .update(invoices)
      .set({
        deletedAt,
        deletedById: params.userId,
        updatedAt: new Date(),
      })
      .where(eq(invoices.id, params.invoiceId))
      .returning()
      .get();
  });

  await recordAuditEvent({
    invoiceId: params.invoiceId,
    userId: params.userId,
    action: "invoice.deleted",
    details: { reason, previousStatus: invoice.status },
  });

  return { invoice: updated };
}

export async function restoreInvoice(params: {
  invoiceId: string;
  organizationId: string;
  userId: string;
}) {
  const invoice = await db.query.invoices.findFirst({
    where: and(
      eq(invoices.id, params.invoiceId),
      eq(invoices.organizationId, params.organizationId),
    ),
  });

  if (!invoice) {
    return { error: "not_found" as const };
  }

  if (!isInvoiceDeleted(invoice)) {
    return { error: "not_deleted" as const };
  }

  if (!isInvoiceVisibleInTrash(invoice.deletedAt)) {
    return { error: "expired" as const };
  }

  const updated = db
    .update(invoices)
    .set({
      deletedAt: null,
      deletedById: null,
      updatedAt: new Date(),
    })
    .where(eq(invoices.id, params.invoiceId))
    .returning()
    .get();

  await recordAuditEvent({
    invoiceId: params.invoiceId,
    userId: params.userId,
    action: "invoice.restored",
    details: { status: invoice.status },
  });

  return { invoice: updated };
}
