import { and, desc, eq } from "drizzle-orm";
import { db, emailThreads, o365Connections } from "@/lib/db";

export async function loadInboxConnection(organizationId: string) {
  return db.query.o365Connections.findFirst({
    where: eq(o365Connections.organizationId, organizationId),
  });
}

export async function loadInboxThreads(organizationId: string) {
  return db.query.emailThreads.findMany({
    where: eq(emailThreads.organizationId, organizationId),
    with: {
      supplier: { columns: { id: true, name: true } },
      messages: {
        columns: {
          id: true,
          direction: true,
          fromEmail: true,
          fromName: true,
          bodyText: true,
          receivedAt: true,
        },
        orderBy: (table, { desc: orderDesc }) => [orderDesc(table.receivedAt)],
      },
    },
    orderBy: desc(emailThreads.lastMessageAt),
  });
}

export async function loadInboxThread(organizationId: string, threadId: string) {
  return db.query.emailThreads.findFirst({
    where: and(
      eq(emailThreads.id, threadId),
      eq(emailThreads.organizationId, organizationId),
    ),
    with: {
      supplier: { columns: { id: true, name: true } },
      messages: {
        with: {
          attachments: {
            columns: {
              id: true,
              fileName: true,
              isInline: true,
              contentId: true,
            },
          },
          invoice: {
            columns: { id: true, vendorName: true, originalFileName: true },
          },
          supplier: { columns: { id: true, name: true } },
        },
        orderBy: (table, { asc }) => [asc(table.receivedAt)],
      },
    },
  });
}
