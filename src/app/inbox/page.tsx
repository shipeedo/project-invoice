import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { AppShell } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { db, emailThreads, o365Connections } from "@/lib/db";
import { requireSession, formatDate } from "@/lib/session";
import { cn } from "@/lib/utils";

export default async function InboxPage() {
  const session = await requireSession();

  const [threads, connection] = await Promise.all([
    db.query.emailThreads.findMany({
      where: eq(emailThreads.organizationId, session.user.organizationId),
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
          limit: 1,
        },
      },
      orderBy: desc(emailThreads.lastMessageAt),
    }),
    db.query.o365Connections.findFirst({
      where: eq(o365Connections.organizationId, session.user.organizationId),
    }),
  ]);

  const connected = connection?.status === "CONNECTED";

  return (
    <AppShell
      user={session.user}
      activePath="/inbox"
      breadcrumbs={[{ label: "Inbox" }]}
    >
      <div className="space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-2xl font-semibold">Inbox</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Emails from the connected shared mailbox. Senders are treated as
              potential suppliers until linked.
            </p>
          </div>
          {!connected ? (
            <Link href="/admin/o365" className={cn(buttonVariants({ variant: "outline" }))}>
              Connect Office 365
            </Link>
          ) : null}
        </div>

        {threads.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-sm text-muted-foreground">
              {connected
                ? "No emails synced yet. Poll the mailbox from Admin → Office 365, or wait for the next scheduled sync."
                : "Connect Office 365 and select a shared mailbox to view emails here."}
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {threads.map((thread) => {
              const latest = thread.messages[0];
              return (
                <Link key={thread.id} href={`/inbox/${thread.id}`}>
                  <Card className="transition-colors hover:bg-muted/40">
                    <CardHeader className="pb-2">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <CardTitle className="text-base">
                          {thread.subject ?? "(No subject)"}
                        </CardTitle>
                        <span className="text-sm text-muted-foreground">
                          {formatDate(thread.lastMessageAt)}
                        </span>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      <div className="flex flex-wrap gap-2">
                        {thread.supplier ? (
                          <Badge variant="secondary">{thread.supplier.name}</Badge>
                        ) : (
                          <Badge variant="outline">Unlinked sender</Badge>
                        )}
                        {latest ? (
                          <Badge variant="outline">
                            {latest.fromName ?? latest.fromEmail ?? "Unknown"}
                          </Badge>
                        ) : null}
                      </div>
                      {latest?.bodyText ? (
                        <p className="line-clamp-2 text-sm text-muted-foreground">
                          {latest.bodyText}
                        </p>
                      ) : null}
                    </CardContent>
                  </Card>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </AppShell>
  );
}
