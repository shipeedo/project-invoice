import {
  AppShellView,
  type AppShellViewProps,
  type BreadcrumbEntry,
} from "@/components/app-shell-view";
import { getAiBalanceWarning } from "@/lib/ai-connector";
import { getMailboxConnectionSummary } from "@/lib/o365/connection";

export type { BreadcrumbEntry };

type AppShellProps = Omit<
  AppShellViewProps,
  "mailboxConnection" | "aiBalanceWarning"
>;

// Server wrapper: fetches the connected-mailbox summary and the cached AI balance
// warning (DB calls) and hands the presentational AppShellView the result. Because
// the DB imports live here and not in AppShellView, client components can render
// the shell without pulling better-sqlite3 into the browser bundle.
export async function AppShell(props: AppShellProps) {
  const [mailboxConnection, aiBalanceWarning] = await Promise.all([
    getMailboxConnectionSummary(props.user),
    props.user.organizationId
      ? getAiBalanceWarning(props.user.organizationId)
      : Promise.resolve(null),
  ]);
  return (
    <AppShellView
      {...props}
      mailboxConnection={mailboxConnection}
      aiBalanceWarning={aiBalanceWarning}
    />
  );
}
