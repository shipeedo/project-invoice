import { eq } from "drizzle-orm";
import webpush from "web-push";
import { recordAuditEvent } from "@/lib/audit";
import { db, notifications, pushSubscriptions } from "@/lib/db";
import type { NotificationType } from "@/lib/db/types";
import { formatCurrency } from "@/lib/format";

/** One-line invoice summary used as notification body text. */
export function invoiceSummaryLine(invoice: {
  vendorName: string | null;
  invoiceNumber: string | null;
  totalAmount: number | null;
  currency: string | null;
}) {
  return [
    invoice.vendorName ?? "Unknown vendor",
    invoice.invoiceNumber ?? "No invoice number",
    invoice.totalAmount != null
      ? formatCurrency(invoice.totalAmount, invoice.currency ?? "AUD")
      : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

let vapidState: "unconfigured" | "ready" | "missing" | null = null;

function ensureVapidConfigured(): boolean {
  if (vapidState === null) {
    const publicKey = process.env.VAPID_PUBLIC_KEY;
    const privateKey = process.env.VAPID_PRIVATE_KEY;
    const subject = process.env.VAPID_SUBJECT;
    if (publicKey && privateKey && subject) {
      webpush.setVapidDetails(subject, publicKey, privateKey);
      vapidState = "ready";
    } else {
      console.warn(
        "[notifications] VAPID env vars not set — web push delivery is disabled",
      );
      vapidState = "missing";
    }
  }
  return vapidState === "ready";
}

export type PushDeliverySummary = {
  /** Push subscriptions the recipient had when the notification was sent. */
  subscriptions: number;
  delivered: number;
  /** Dead subscriptions (endpoint gone) removed during this send. */
  pruned: number;
  failed: number;
};

/**
 * Notify a user: insert an in-app notification row, record an audit event,
 * and fan out web push to every subscription the recipient has registered.
 *
 * Never throws — notification failure must not break the flow that
 * triggered it (validation, assignment, approval, ...). Returns a delivery
 * summary for callers that want to report it (e.g. test notifications), or
 * null when the notification could not be created at all.
 */
export async function createNotification(params: {
  organizationId: string;
  recipientId: string;
  actorId?: string | null;
  invoiceId?: string | null;
  type: NotificationType;
  title: string;
  body: string;
  /** Deep link opened on click; defaults to the invoice page (or home). */
  url?: string;
  auditAction?: string;
  auditDetails?: Record<string, unknown>;
}): Promise<PushDeliverySummary | null> {
  const url =
    params.url ?? (params.invoiceId ? `/invoices/${params.invoiceId}` : "/");
  try {
    const [notification] = await db
      .insert(notifications)
      .values({
        organizationId: params.organizationId,
        recipientId: params.recipientId,
        actorId: params.actorId ?? null,
        invoiceId: params.invoiceId ?? null,
        type: params.type,
        title: params.title,
        body: params.body,
        url: params.url ?? null,
      })
      .returning();

    await recordAuditEvent({
      invoiceId: params.invoiceId ?? undefined,
      userId: params.actorId ?? undefined,
      action: params.auditAction ?? "notification.sent",
      details: {
        recipientId: params.recipientId,
        type: params.type,
        ...params.auditDetails,
      },
    });

    return await sendPushToUser(params.recipientId, {
      title: params.title,
      body: params.body,
      url,
      tag: notification.id,
    });
  } catch (error) {
    console.error("[notifications] failed to create notification", error);
    return null;
  }
}

async function sendPushToUser(
  userId: string,
  payload: { title: string; body: string; url: string; tag: string },
): Promise<PushDeliverySummary> {
  const summary: PushDeliverySummary = {
    subscriptions: 0,
    delivered: 0,
    pruned: 0,
    failed: 0,
  };

  if (!ensureVapidConfigured()) {
    return summary;
  }

  const subscriptions = await db.query.pushSubscriptions.findMany({
    where: eq(pushSubscriptions.userId, userId),
  });
  summary.subscriptions = subscriptions.length;
  if (subscriptions.length === 0) {
    return summary;
  }

  const body = JSON.stringify(payload);
  await Promise.allSettled(
    subscriptions.map(async (subscription) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: subscription.endpoint,
            keys: { p256dh: subscription.p256dh, auth: subscription.auth },
          },
          body,
          { TTL: 3600 },
        );
        summary.delivered += 1;
        await db
          .update(pushSubscriptions)
          .set({ lastUsedAt: new Date() })
          .where(eq(pushSubscriptions.id, subscription.id));
      } catch (error) {
        const statusCode = (error as { statusCode?: number }).statusCode;
        if (statusCode === 404 || statusCode === 410) {
          // The browser unsubscribed or the endpoint expired — prune it.
          summary.pruned += 1;
          await db
            .delete(pushSubscriptions)
            .where(eq(pushSubscriptions.id, subscription.id));
        } else {
          summary.failed += 1;
          console.error(
            `[notifications] push delivery failed (status ${statusCode ?? "unknown"})`,
            error,
          );
        }
      }
    }),
  );

  return summary;
}
