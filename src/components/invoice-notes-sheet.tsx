"use client";

import {
  ArrowUpIcon,
  MessageSquareTextIcon,
  PaperclipIcon,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Attachment,
  AttachmentContent,
  AttachmentMedia,
  AttachmentTitle,
  AttachmentTrigger,
} from "@/components/ui/attachment";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Bubble, BubbleContent } from "@/components/ui/bubble";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupTextarea,
} from "@/components/ui/input-group";
import { Marker, MarkerContent } from "@/components/ui/marker";
import {
  Message,
  MessageAvatar,
  MessageContent,
  MessageFooter,
  MessageHeader,
} from "@/components/ui/message";
import {
  MessageScroller,
  MessageScrollerButton,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerProvider,
  MessageScrollerViewport,
  useMessageScroller,
} from "@/components/ui/message-scroller";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { formatDate } from "@/lib/format";
import { mentionToken, splitMentionSegments } from "@/lib/mentions";

export type InvoiceNoteItem = {
  id: string;
  content: string;
  createdAt: string;
  authorId: string | null;
  authorName: string | null;
  document: { id: string; fileName: string } | null;
};

type OrgUser = {
  id: string;
  name: string | null;
  email: string;
};

type InvoiceNotesSheetProps = {
  invoiceId: string;
  notes: InvoiceNoteItem[];
  canCompose: boolean;
  currentUserId: string;
  // Deep link target (e.g. from a mention notification): opens the sheet,
  // scrolls to the note and highlights it briefly.
  initialNoteId?: string | null;
  // When `open` is provided the sheet is controlled by the parent (no
  // built-in trigger button is rendered) and `onOpenChange` is required.
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
};

const dayFormatter = new Intl.DateTimeFormat("en-AU", { dateStyle: "medium" });

function initials(name: string) {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");
}

function userLabel(user: OrgUser) {
  return user.name ?? user.email;
}

/** The `@query` being typed at the caret, if any. */
function detectMention(value: string, caret: number) {
  const match = /(?:^|\s)@([^\s@]*)$/.exec(value.slice(0, caret));
  if (!match) return null;
  return { start: caret - match[1].length - 1, query: match[1] };
}

function NoteBody({ content }: { content: string }) {
  const segments = splitMentionSegments(content);
  return (
    <span className="whitespace-pre-wrap">
      {segments.map((segment, index) =>
        segment.type === "text" ? (
          <span key={index}>{segment.text}</span>
        ) : (
          <span key={index} className="font-semibold underline underline-offset-2">
            @{segment.name}
          </span>
        ),
      )}
    </span>
  );
}

/** Scrolls the thread to a note once its item is measured. */
function ScrollToNote({ noteId }: { noteId: string }) {
  const { scrollToMessage } = useMessageScroller();

  useEffect(() => {
    let tries = 0;
    let timer: ReturnType<typeof setTimeout>;
    const attempt = () => {
      if (!scrollToMessage(noteId, { align: "center" }) && tries++ < 20) {
        timer = setTimeout(attempt, 50);
      }
    };
    timer = setTimeout(attempt, 50);
    return () => clearTimeout(timer);
  }, [noteId, scrollToMessage]);

  return null;
}

export function InvoiceNotesSheet({
  invoiceId,
  notes,
  canCompose,
  currentUserId,
  initialNoteId,
  open: controlledOpen,
  onOpenChange,
}: InvoiceNotesSheetProps) {
  const router = useRouter();
  const [uncontrolledOpen, setUncontrolledOpen] = useState(() =>
    Boolean(initialNoteId),
  );
  const isControlled = controlledOpen !== undefined;
  const open = isControlled ? controlledOpen : uncontrolledOpen;
  const setOpen = isControlled ? (onOpenChange ?? (() => {})) : setUncontrolledOpen;

  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [highlightId, setHighlightId] = useState<string | null>(
    initialNoteId ?? null,
  );

  // Mention composer state. `mentionsRef` remembers every label inserted from
  // the picker so the draft can be tokenized to `@[Name](id)` on submit.
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [users, setUsers] = useState<OrgUser[]>([]);
  const [mention, setMention] = useState<{ start: number; query: string } | null>(
    null,
  );
  const [activeIndex, setActiveIndex] = useState(0);
  const mentionsRef = useRef(new Map<string, string>());

  const thread = useMemo(
    () =>
      [...notes].sort(
        (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
      ),
    [notes],
  );

  useEffect(() => {
    if (!open || !canCompose) return;
    fetch("/api/users")
      .then(async (response) => {
        if (!response.ok) return;
        const body = (await response.json()) as { users: OrgUser[] };
        setUsers(body.users);
      })
      .catch(() => {
        // Mentions degrade to plain text if the list can't be loaded.
      });
  }, [open, canCompose]);

  // React to deep-link changes after mount too (client-side navigation from a
  // notification while this page is already rendered). Adjusting state during
  // render on a prop change avoids the cascading re-render an effect would cause.
  const [lastInitialNoteId, setLastInitialNoteId] = useState(initialNoteId);
  if (initialNoteId !== lastInitialNoteId) {
    setLastInitialNoteId(initialNoteId);
    if (initialNoteId) {
      setHighlightId(initialNoteId);
      if (!isControlled) setUncontrolledOpen(true);
    }
  }

  useEffect(() => {
    if (!highlightId || !open) return;
    const timer = setTimeout(() => setHighlightId(null), 3000);
    return () => clearTimeout(timer);
  }, [highlightId, open]);

  const mentionMatches = useMemo(() => {
    if (!mention) return [];
    const query = mention.query.toLowerCase();
    return users
      .filter(
        (user) =>
          userLabel(user).toLowerCase().includes(query) ||
          user.email.toLowerCase().includes(query),
      )
      .slice(0, 6);
  }, [mention, users]);

  function handleDraftChange(value: string, caret: number) {
    setDraft(value);
    const next = detectMention(value, caret);
    setMention(next);
    if (next?.start !== mention?.start) setActiveIndex(0);
  }

  function insertMention(user: OrgUser) {
    if (!mention) return;
    const label = userLabel(user);
    const end = mention.start + 1 + mention.query.length;
    const next = `${draft.slice(0, mention.start)}@${label} ${draft.slice(end)}`;
    mentionsRef.current.set(label, user.id);
    setDraft(next);
    setMention(null);
    const caret = mention.start + label.length + 2;
    requestAnimationFrame(() => {
      textareaRef.current?.focus();
      textareaRef.current?.setSelectionRange(caret, caret);
    });
  }

  function tokenizeDraft(content: string) {
    // Longest labels first so "Jay Baker" wins over a hypothetical "Jay".
    const entries = [...mentionsRef.current.entries()].sort(
      (a, b) => b[0].length - a[0].length,
    );
    let result = content;
    for (const [label, id] of entries) {
      result = result.split(`@${label}`).join(mentionToken(label, id));
    }
    return result;
  }

  async function addNote() {
    const content = tokenizeDraft(draft.trim());
    if (!content) return;

    setSaving(true);
    setError(null);

    const response = await fetch(`/api/invoices/${invoiceId}/notes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content }),
    });

    setSaving(false);

    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as { error?: string } | null;
      setError(body?.error ?? "Failed to add note");
      return;
    }

    setDraft("");
    setMention(null);
    mentionsRef.current.clear();
    router.refresh();
  }

  function handleComposerKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (mention && mentionMatches.length > 0) {
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        const delta = event.key === "ArrowDown" ? 1 : -1;
        setActiveIndex(
          (activeIndex + delta + mentionMatches.length) % mentionMatches.length,
        );
        return;
      }
      if (event.key === "Enter" || event.key === "Tab") {
        event.preventDefault();
        insertMention(mentionMatches[activeIndex]);
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        setMention(null);
        return;
      }
    }
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      if (!saving) void addNote();
    }
  }

  return (
    <>
      {isControlled ? null : (
        <Button type="button" size="sm" variant="outline" onClick={() => setOpen(true)}>
          <MessageSquareTextIcon />
          Notes
          {notes.length > 0 ? (
            <Badge variant="secondary" className="px-1.5">
              {notes.length}
            </Badge>
          ) : null}
        </Button>
      )}

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-lg">
          <SheetHeader className="border-b px-6 py-5">
            <SheetTitle>Notes</SheetTitle>
            <SheetDescription>
              Notes recorded against this invoice. Type @ to tag a colleague.
            </SheetDescription>
          </SheetHeader>

          <div className="min-h-0 flex-1">
            {thread.length === 0 ? (
              <Empty>
                <EmptyHeader>
                  <EmptyTitle>No notes yet</EmptyTitle>
                  {canCompose ? (
                    <EmptyDescription>Add the first note below.</EmptyDescription>
                  ) : null}
                </EmptyHeader>
              </Empty>
            ) : (
              <MessageScrollerProvider defaultScrollPosition="end">
                <MessageScroller>
                  <MessageScrollerViewport aria-label="Invoice notes">
                    <MessageScrollerContent className="px-6 py-5">
                      {thread.map((note, index) => {
                        const isOwn = note.authorId === currentUserId;
                        const day = dayFormatter.format(new Date(note.createdAt));
                        const previousDay =
                          index > 0
                            ? dayFormatter.format(new Date(thread[index - 1].createdAt))
                            : null;
                        return (
                          <MessageScrollerItem key={note.id} messageId={note.id}>
                            {day !== previousDay ? (
                              <Marker variant="separator" className="mb-6">
                                <MarkerContent>{day}</MarkerContent>
                              </Marker>
                            ) : null}
                            <Message align={isOwn ? "end" : "start"}>
                              <MessageAvatar>
                                <Avatar className="size-8">
                                  <AvatarFallback>
                                    {initials(note.authorName ?? "System")}
                                  </AvatarFallback>
                                </Avatar>
                              </MessageAvatar>
                              <MessageContent>
                                <MessageHeader>
                                  {note.authorName ?? "System"}
                                </MessageHeader>
                                <Bubble
                                  variant={
                                    isOwn ? "default" : note.authorId ? "muted" : "outline"
                                  }
                                  align={isOwn ? "end" : "start"}
                                >
                                  <BubbleContent
                                    className={cn(
                                      "transition-shadow duration-500",
                                      highlightId === note.id &&
                                        "ring-3 ring-ring/50",
                                    )}
                                  >
                                    <NoteBody content={note.content} />
                                  </BubbleContent>
                                </Bubble>
                                {note.document ? (
                                  <Attachment size="sm" state="done">
                                    <AttachmentMedia variant="icon">
                                      <PaperclipIcon />
                                    </AttachmentMedia>
                                    <AttachmentContent>
                                      <AttachmentTitle>
                                        {note.document.fileName}
                                      </AttachmentTitle>
                                    </AttachmentContent>
                                    <AttachmentTrigger
                                      render={
                                        <a
                                          href={`/api/invoices/${invoiceId}/documents/${note.document.id}`}
                                          target="_blank"
                                          rel="noreferrer"
                                        />
                                      }
                                    >
                                      <span className="sr-only">
                                        Open {note.document.fileName}
                                      </span>
                                    </AttachmentTrigger>
                                  </Attachment>
                                ) : null}
                                <MessageFooter>{formatDate(note.createdAt)}</MessageFooter>
                              </MessageContent>
                            </Message>
                          </MessageScrollerItem>
                        );
                      })}
                    </MessageScrollerContent>
                  </MessageScrollerViewport>
                  <MessageScrollerButton />
                </MessageScroller>
                {initialNoteId ? <ScrollToNote noteId={initialNoteId} /> : null}
              </MessageScrollerProvider>
            )}
          </div>

          {canCompose ? (
            <SheetFooter className="border-t px-6 py-4">
              <div className="relative">
                {mention && mentionMatches.length > 0 ? (
                  <div className="absolute inset-x-0 bottom-full mb-1 overflow-hidden rounded-lg bg-popover text-popover-foreground shadow-md ring-1 ring-foreground/10">
                    <div className="flex flex-col p-1" role="listbox" aria-label="Tag a colleague">
                      {mentionMatches.map((user, index) => (
                        <button
                          key={user.id}
                          type="button"
                          role="option"
                          aria-selected={index === activeIndex}
                          className={cn(
                            "flex items-center gap-2 rounded-md px-1.5 py-1 text-left text-sm",
                            index === activeIndex && "bg-accent text-accent-foreground",
                          )}
                          onMouseEnter={() => setActiveIndex(index)}
                          onMouseDown={(event) => {
                            event.preventDefault();
                            insertMention(user);
                          }}
                        >
                          <Avatar className="size-5">
                            <AvatarFallback className="text-[10px]">
                              {initials(userLabel(user))}
                            </AvatarFallback>
                          </Avatar>
                          <span className="truncate">{userLabel(user)}</span>
                          <span className="truncate text-xs text-muted-foreground">
                            {user.email}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}
                <InputGroup>
                  <InputGroupTextarea
                    ref={textareaRef}
                    value={draft}
                    onChange={(event) =>
                      handleDraftChange(
                        event.target.value,
                        event.target.selectionStart ?? event.target.value.length,
                      )
                    }
                    onKeyDown={handleComposerKeyDown}
                    placeholder="Add a note — type @ to tag a colleague"
                    className="max-h-40 min-h-10 overflow-y-auto"
                    disabled={saving}
                  />
                  <InputGroupAddon align="block-end" className="p-2">
                    <InputGroupButton
                      variant="default"
                      size="icon-sm"
                      type="button"
                      className="ml-auto"
                      onClick={() => void addNote()}
                      disabled={saving || !draft.trim()}
                      aria-label="Add note"
                    >
                      <ArrowUpIcon />
                    </InputGroupButton>
                  </InputGroupAddon>
                </InputGroup>
              </div>
              {error ? <p className="text-sm text-destructive">{error}</p> : null}
            </SheetFooter>
          ) : null}
        </SheetContent>
      </Sheet>
    </>
  );
}
