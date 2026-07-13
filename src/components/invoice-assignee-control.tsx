"use client";

import { BellRingIcon, CheckIcon, UserIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { InvoiceStatus, UserRole } from "@/lib/db/types";

type OrgUser = {
  id: string;
  name: string | null;
  email: string;
  role: UserRole;
};

type InvoiceAssigneeControlProps = {
  invoiceId: string;
  assignedToId: string | null;
  assignedToName: string | null;
  currentUserId: string;
  status: InvoiceStatus;
};

const UNASSIGNED = "__unassigned__";

export function InvoiceAssigneeControl({
  invoiceId,
  assignedToId,
  assignedToName,
  currentUserId,
  status,
}: InvoiceAssigneeControlProps) {
  const router = useRouter();
  const [users, setUsers] = useState<OrgUser[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [reminding, setReminding] = useState(false);
  const [reminderOpen, setReminderOpen] = useState(false);
  const [reminderNote, setReminderNote] = useState("");
  const [reminderError, setReminderError] = useState<string | null>(null);
  const [reminderSent, setReminderSent] = useState(false);

  const disabled = status === "CANCELLED";

  useEffect(() => {
    fetch("/api/users")
      .then(async (response) => {
        if (!response.ok) return;
        const body = (await response.json()) as { users: OrgUser[] };
        setUsers(body.users);
      })
      .catch(() => {
        // Leave the current assignee as the only visible option.
      });
  }, []);

  // Labels for every selectable value; also lets the Select render the
  // selected label in its trigger (base-ui shows the raw value otherwise).
  const selectItems = useMemo(() => {
    const base = [{ value: UNASSIGNED, label: "Unassigned" }];
    if (users) {
      return [
        ...base,
        ...users.map((user) => ({
          value: user.id,
          label: `${user.name ?? user.email}${user.id === currentUserId ? " (you)" : ""}`,
        })),
      ];
    }
    if (assignedToId) {
      base.push({
        value: assignedToId,
        label: assignedToName ?? "Current assignee",
      });
    }
    return base;
  }, [users, assignedToId, assignedToName, currentUserId]);

  async function assign(value: string) {
    const assigneeId = value === UNASSIGNED ? null : value;
    if (assigneeId === assignedToId) return;
    setSaving(true);
    setError(null);

    const response = await fetch(`/api/invoices/${invoiceId}/assign`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ assigneeId }),
    });

    setSaving(false);

    if (!response.ok) {
      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
      };
      setError(payload.error ?? "Could not update the assignee");
      return;
    }

    router.refresh();
  }

  function openReminderDialog() {
    setReminderOpen(true);
    setReminderNote("");
    setReminderError(null);
    setError(null);
  }

  async function remind() {
    setReminding(true);
    setReminderError(null);

    const response = await fetch(`/api/invoices/${invoiceId}/remind`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ note: reminderNote.trim() || undefined }),
    });

    setReminding(false);

    if (!response.ok) {
      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
      };
      setReminderError(payload.error ?? "Could not send the reminder");
      return;
    }

    setReminderOpen(false);
    setReminderSent(true);
    setTimeout(() => setReminderSent(false), 2000);
    router.refresh();
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex items-center gap-2">
        <UserIcon
          className="hidden size-4 text-muted-foreground sm:block"
          aria-hidden
        />
        <Select
          items={selectItems}
          value={assignedToId ?? UNASSIGNED}
          onValueChange={(next) => next && void assign(next)}
          disabled={disabled || saving}
        >
          <SelectTrigger size="sm" className="w-40" aria-label="Assignee">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {selectItems.map((item) => (
              <SelectItem key={item.value} value={item.value}>
                {item.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {assignedToId ? (
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  type="button"
                  size="icon-sm"
                  variant="outline"
                  aria-label={reminderSent ? "Reminder sent" : "Send reminder"}
                  onClick={openReminderDialog}
                  disabled={disabled || reminderSent}
                />
              }
            >
              {reminderSent ? (
                <CheckIcon className="text-emerald-600" />
              ) : (
                <BellRingIcon />
              )}
            </TooltipTrigger>
            <TooltipContent>
              {reminderSent ? "Reminder sent" : "Send reminder"}
            </TooltipContent>
          </Tooltip>
        ) : null}
      </div>
      {error ? (
        <p className="max-w-xs text-right text-xs text-destructive">{error}</p>
      ) : null}

      <Dialog
        open={reminderOpen}
        onOpenChange={(nextOpen) => !nextOpen && !reminding && setReminderOpen(false)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {assignedToId === currentUserId
                ? "Send yourself a reminder?"
                : `Send reminder to ${assignedToName ?? "the assignee"}?`}
            </DialogTitle>
            <DialogDescription>
              They&apos;ll get a notification that this invoice needs their
              attention. You can add a short note.
            </DialogDescription>
          </DialogHeader>

          <Textarea
            value={reminderNote}
            onChange={(event) => setReminderNote(event.target.value)}
            placeholder="Note (optional)"
            maxLength={500}
          />

          {reminderError ? (
            <p className="text-sm text-destructive">{reminderError}</p>
          ) : null}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setReminderOpen(false)}
              disabled={reminding}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={() => void remind()}
              disabled={reminding}
            >
              {reminding ? "Sending..." : "Send reminder"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
