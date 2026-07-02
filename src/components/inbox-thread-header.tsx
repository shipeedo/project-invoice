"use client";

type InboxThreadHeaderProps = {
  subject: string | null;
  messageCount: number;
};

export function InboxThreadHeader({ subject, messageCount }: InboxThreadHeaderProps) {
  return (
    <header className="shrink-0 border-b px-4 py-2.5">
      <h3 className="truncate text-base font-semibold leading-snug">
        {subject ?? "(No subject)"}
      </h3>
      {messageCount > 0 ? (
        <p className="mt-1.5 text-xs text-muted-foreground">
          {messageCount} message{messageCount === 1 ? "" : "s"}
        </p>
      ) : null}
    </header>
  );
}
