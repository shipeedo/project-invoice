import {
  AppShellView,
  type AppShellViewProps,
  type BreadcrumbEntry,
} from "@/components/app-shell-view";
import { getMailboxConnectionSummary } from "@/lib/o365/connection";

export type { BreadcrumbEntry };

type AppShellProps = Omit<AppShellViewProps, "mailboxConnection">;

// Server wrapper: fetches the connected-mailbox summary (a DB call) and hands
// the presentational AppShellView the result. Because the DB import lives here
// and not in AppShellView, client components can render the shell without
// pulling better-sqlite3 into the browser bundle.
export async function AppShell(props: AppShellProps) {
  const mailboxConnection = await getMailboxConnectionSummary(props.user);
  return <AppShellView {...props} mailboxConnection={mailboxConnection} />;
}
