"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  AlertTriangleIcon,
  ArrowDownIcon,
  ArrowUpIcon,
  ChevronDownIcon,
  ChevronsUpDownIcon,
  MessageSquareTextIcon,
  PaperclipIcon,
  SearchIcon,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  InvoiceDocumentsSheet,
  isDefaultVisibleDocument,
  type InvoiceDocumentLink,
} from "@/components/invoice-documents-sheet";
import {
  InvoiceNotesSheet,
  type InvoiceNoteItem,
} from "@/components/invoice-notes-sheet";
import { StatusBadge } from "@/components/status-badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { InvoiceStatus } from "@/lib/db/types";
import { invoiceStatuses } from "@/lib/db/types";
import { formatCurrency, statusLabel } from "@/lib/format";
import {
  formatDateOnly,
  getInvoiceDeadlineSignals,
  getRespondByDate,
  matchesInvoiceSearch,
  matchesUrgencyFilter,
  needsMyUrgentAttention,
  type DeadlineSignal,
  type UrgencyFilter,
} from "@/lib/invoice-deadlines";
import { cn } from "@/lib/utils";

export type InvoiceQueueRow = {
  id: string;
  status: InvoiceStatus;
  vendorName: string | null;
  originalFileName: string | null;
  invoiceNumber: string | null;
  emailSubject: string | null;
  totalAmount: number | null;
  currency: string | null;
  parseError: string | null;
  createdAt: string;
  validatedAt: string | null;
  dueDate: string | null;
  respondByDate: string | null;
  assignedToId: string | null;
  supplierId: string | null;
  assignedTo: { id: string; name: string | null; email: string } | null;
  supplier: { id: string; name: string } | null;
  notes: InvoiceNoteItem[];
  documents: InvoiceDocumentLink[];
};

type InvoiceQueueProps = {
  invoices: InvoiceQueueRow[];
  suppliers: Array<{ id: string; name: string }>;
  users: Array<{ id: string; name: string | null; email: string }>;
  currentUserId: string;
};

function userLabel(user: { name: string | null; email: string }) {
  return user.name ?? user.email;
}

function supplierLabel(invoice: InvoiceQueueRow) {
  return (
    invoice.supplier?.name ??
    invoice.vendorName ??
    invoice.originalFileName ??
    "Unknown supplier"
  );
}

function urgencyBadgeVariant(
  urgency: DeadlineSignal["urgency"],
): "destructive" | "default" | "secondary" | "outline" {
  if (urgency === "overdue") return "destructive";
  if (urgency === "due_today" || urgency === "due_tomorrow") return "default";
  if (urgency === "due_next_business_day") return "outline";
  return "secondary";
}

function DeadlineBadges({ signals }: { signals: DeadlineSignal[] }) {
  if (signals.length === 0) return <span className="text-muted-foreground">—</span>;

  return (
    <div className="flex flex-wrap gap-1">
      {signals.map((signal) => (
        <Badge
          key={`${signal.kind}-${signal.urgency}`}
          variant={urgencyBadgeVariant(signal.urgency)}
          className="text-[10px]"
        >
          {signal.label}
        </Badge>
      ))}
    </div>
  );
}

const URGENCY_FILTER_VALUES: UrgencyFilter[] = [
  "all",
  "needs_my_attention",
  "overdue",
  "due_tomorrow",
  "nearing_respond",
  "nearing_due",
];

const URGENCY_LABELS: Record<UrgencyFilter, string> = {
  all: "All invoices",
  needs_my_attention: "Needs my attention",
  overdue: "Overdue",
  due_tomorrow: "Due tomorrow",
  nearing_respond: "Nearing respond-by",
  nearing_due: "Nearing due date",
};

function parseListParam(value: string | null): string[] {
  return value ? value.split(",").filter(Boolean) : [];
}

const SORT_KEYS = [
  "supplier",
  "status",
  "total",
  "assignee",
  "respondBy",
  "due",
  "received",
] as const;

type SortKey = (typeof SORT_KEYS)[number];
type SortDirection = "asc" | "desc";

const DEFAULT_SORT_KEY: SortKey = "received";
const DEFAULT_SORT_DIRECTION: SortDirection = "desc";

function SortableHead({
  label,
  active,
  direction,
  onSort,
}: {
  label: string;
  active: boolean;
  direction: SortDirection;
  onSort: () => void;
}) {
  return (
    <TableHead aria-sort={active ? (direction === "asc" ? "ascending" : "descending") : "none"}>
      <button
        type="button"
        onClick={onSort}
        className="flex items-center gap-1 hover:text-foreground"
      >
        {label}
        {active ? (
          direction === "asc" ? (
            <ArrowUpIcon className="size-3.5" />
          ) : (
            <ArrowDownIcon className="size-3.5" />
          )
        ) : (
          <ChevronsUpDownIcon className="size-3.5 text-muted-foreground/50" />
        )}
      </button>
    </TableHead>
  );
}

type FacetOption = { value: string; label: string };

function MultiSelectFilter({
  id,
  allLabel,
  noun,
  options,
  selected,
  onToggle,
}: {
  id: string;
  allLabel: string;
  noun: string;
  options: FacetOption[];
  selected: string[];
  onToggle: (value: string) => void;
}) {
  const triggerLabel =
    selected.length === 0
      ? allLabel
      : selected.length === 1
        ? (options.find((option) => option.value === selected[0])?.label ??
          "1 selected")
        : `${selected.length} ${noun}`;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            id={id}
            type="button"
            variant="outline"
            className="w-full justify-between font-normal"
          />
        }
      >
        <span className="truncate">{triggerLabel}</span>
        <ChevronDownIcon className="size-4 shrink-0 text-muted-foreground" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="max-h-72 min-w-48 overflow-y-auto">
        {options.map((option) => (
          <DropdownMenuCheckboxItem
            key={option.value}
            checked={selected.includes(option.value)}
            onCheckedChange={() => onToggle(option.value)}
          >
            {option.label}
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function InvoiceQueue({
  invoices,
  suppliers,
  users,
  currentUserId,
}: InvoiceQueueProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // The URL is the source of truth for filter state so views can be
  // deep-linked and shared. Multi-value facets are comma-separated.
  const urlSearch = searchParams.get("q") ?? "";
  const supplierFilter = parseListParam(searchParams.get("supplier"));
  const assigneeFilter = parseListParam(searchParams.get("assignee"));
  const statusFilter = parseListParam(searchParams.get("status"));
  // Statuses excluded from a preset view (e.g. "Assigned to me" hides
  // Approved). An explicit status filter selection overrides the exclusion.
  const hiddenStatuses = parseListParam(searchParams.get("hide")).filter(
    (value): value is InvoiceStatus =>
      invoiceStatuses.includes(value as InvoiceStatus),
  );
  const urgencyParam = searchParams.get("urgency") as UrgencyFilter | null;
  const urgencyFilter: UrgencyFilter =
    urgencyParam && URGENCY_FILTER_VALUES.includes(urgencyParam)
      ? urgencyParam
      : "all";

  const sortParam = searchParams.get("sort");
  const sortKey: SortKey = SORT_KEYS.includes(sortParam as SortKey)
    ? (sortParam as SortKey)
    : DEFAULT_SORT_KEY;
  const dirParam = searchParams.get("dir");
  const sortDirection: SortDirection =
    dirParam === "asc" || dirParam === "desc"
      ? dirParam
      : sortKey === DEFAULT_SORT_KEY
        ? DEFAULT_SORT_DIRECTION
        : "asc";

  // The search box stays local while typing and syncs to ?q= debounced.
  const [search, setSearch] = useState(urlSearch);
  const lastAppliedSearch = useRef(urlSearch);

  const [notesInvoiceId, setNotesInvoiceId] = useState<string | null>(null);
  const notesInvoice = notesInvoiceId
    ? (invoices.find((invoice) => invoice.id === notesInvoiceId) ?? null)
    : null;

  const [documentsInvoiceId, setDocumentsInvoiceId] = useState<string | null>(null);
  const documentsInvoice = documentsInvoiceId
    ? (invoices.find((invoice) => invoice.id === documentsInvoiceId) ?? null)
    : null;

  const setParams = useCallback(
    (updates: Record<string, string | string[] | null>) => {
      const params = new URLSearchParams(searchParams.toString());
      for (const [key, rawValue] of Object.entries(updates)) {
        const value = Array.isArray(rawValue) ? rawValue.join(",") : rawValue;
        if (!value || value === "all") {
          params.delete(key);
        } else {
          params.set(key, value);
        }
      }
      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [searchParams, router, pathname],
  );

  const toggleListParam = useCallback(
    (key: string, current: string[], value: string) => {
      const next = current.includes(value)
        ? current.filter((entry) => entry !== value)
        : [...current, value];
      setParams({ [key]: next });
    },
    [setParams],
  );

  useEffect(() => {
    if (search === urlSearch) {
      lastAppliedSearch.current = search;
      return;
    }
    const timer = setTimeout(() => {
      lastAppliedSearch.current = search;
      setParams({ q: search });
    }, 250);
    return () => clearTimeout(timer);
  }, [search, urlSearch, setParams]);

  // Adopt external URL changes (back/forward navigation, deep links).
  useEffect(() => {
    if (urlSearch !== lastAppliedSearch.current) {
      lastAppliedSearch.current = urlSearch;
      setSearch(urlSearch);
    }
  }, [urlSearch]);

  const now = useMemo(() => new Date(), []);

  const urgentForMe = useMemo(
    () =>
      invoices.filter((invoice) =>
        needsMyUrgentAttention(
          {
            ...invoice,
            createdAt: invoice.createdAt,
            validatedAt: invoice.validatedAt,
            dueDate: invoice.dueDate,
          },
          currentUserId,
          now,
        ),
      ),
    [invoices, currentUserId, now],
  );

  const filteredInvoices = useMemo(() => {
    return invoices.filter((invoice) => {
      if (
        supplierFilter.length > 0 &&
        (!invoice.supplierId || !supplierFilter.includes(invoice.supplierId))
      ) {
        return false;
      }

      if (assigneeFilter.length > 0) {
        const matchesAssignee = assigneeFilter.some((entry) => {
          if (entry === "unassigned") return !invoice.assignedToId;
          if (entry === "me") return invoice.assignedToId === currentUserId;
          return invoice.assignedToId === entry;
        });
        if (!matchesAssignee) return false;
      }

      if (statusFilter.length > 0 && !statusFilter.includes(invoice.status)) {
        return false;
      }

      if (statusFilter.length === 0 && hiddenStatuses.includes(invoice.status)) {
        return false;
      }

      if (
        !matchesUrgencyFilter(
          {
            ...invoice,
            createdAt: invoice.createdAt,
            validatedAt: invoice.validatedAt,
            dueDate: invoice.dueDate,
          },
          urgencyFilter,
          currentUserId,
          now,
        )
      ) {
        return false;
      }

      return matchesInvoiceSearch(
        {
          ...invoice,
          createdAt: invoice.createdAt,
          validatedAt: invoice.validatedAt,
          dueDate: invoice.dueDate,
        },
        search,
      );
    });
  }, [
    invoices,
    supplierFilter,
    assigneeFilter,
    statusFilter,
    hiddenStatuses,
    urgencyFilter,
    search,
    currentUserId,
    now,
  ]);

  const sortedInvoices = useMemo(() => {
    const factor = sortDirection === "asc" ? 1 : -1;

    const sortValue = (invoice: InvoiceQueueRow): string | number | null => {
      switch (sortKey) {
        case "supplier":
          return supplierLabel(invoice).toLowerCase();
        case "status":
          return invoiceStatuses.indexOf(invoice.status);
        case "total":
          return invoice.totalAmount;
        case "assignee":
          return invoice.assignedTo
            ? userLabel(invoice.assignedTo).toLowerCase()
            : null;
        case "respondBy": {
          const date = getRespondByDate({
            status: invoice.status,
            createdAt: invoice.createdAt,
            validatedAt: invoice.validatedAt,
            dueDate: invoice.dueDate,
            respondByDate: invoice.respondByDate,
          });
          return date ? date.getTime() : null;
        }
        case "due":
          return invoice.dueDate ? new Date(invoice.dueDate).getTime() : null;
        case "received":
          return new Date(invoice.createdAt).getTime();
      }
    };

    return [...filteredInvoices].sort((a, b) => {
      const av = sortValue(a);
      const bv = sortValue(b);
      // Missing values always sink to the bottom, regardless of direction.
      if (av === null && bv === null) return 0;
      if (av === null) return 1;
      if (bv === null) return -1;
      if (typeof av === "number" && typeof bv === "number") {
        return (av - bv) * factor;
      }
      return String(av).localeCompare(String(bv)) * factor;
    });
  }, [filteredInvoices, sortKey, sortDirection]);

  const handleSort = useCallback(
    (key: SortKey) => {
      const nextDirection: SortDirection =
        key === sortKey
          ? sortDirection === "asc"
            ? "desc"
            : "asc"
          : key === DEFAULT_SORT_KEY
            ? DEFAULT_SORT_DIRECTION
            : "asc";
      setParams({ sort: key, dir: nextDirection });
    },
    [sortKey, sortDirection, setParams],
  );

  const hasActiveFilters =
    search.trim() !== "" ||
    supplierFilter.length > 0 ||
    assigneeFilter.length > 0 ||
    statusFilter.length > 0 ||
    hiddenStatuses.length > 0 ||
    urgencyFilter !== "all";

  return (
    <div className="space-y-6">
      {urgentForMe.length > 0 && urgencyFilter !== "needs_my_attention" ? (
        <Alert variant="destructive">
          <AlertTriangleIcon />
          <AlertTitle>
            {urgentForMe.length} invoice{urgentForMe.length === 1 ? "" : "s"} need
            your urgent attention
          </AlertTitle>
          <AlertDescription className="space-y-2">
            <p>
              Assigned to you and overdue, due today, due tomorrow, or due next
              business day.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="border-destructive/40 bg-background"
                onClick={() => setParams({ urgency: "needs_my_attention" })}
              >
                Show only my urgent items
              </Button>
              {urgentForMe.slice(0, 3).map((invoice) => (
                <Button
                  key={invoice.id}
                  size="sm"
                  variant="ghost"
                  className="h-auto px-2 py-1 text-destructive"
                  nativeButton={false}
                  render={<Link href={`/invoices/${invoice.id}`} />}
                >
                  {supplierLabel(invoice)}
                </Button>
              ))}
            </div>
          </AlertDescription>
        </Alert>
      ) : null}

      <Card>
        <CardHeader className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <CardTitle>
              {filteredInvoices.length === invoices.length
                ? `All invoices (${invoices.length})`
                : `${filteredInvoices.length} of ${invoices.length} invoices`}
            </CardTitle>
            {hasActiveFilters ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  setSearch("");
                  lastAppliedSearch.current = "";
                  router.replace(pathname, { scroll: false });
                }}
              >
                Clear filters
              </Button>
            ) : null}
          </div>

          {hiddenStatuses.length > 0 && statusFilter.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              {hiddenStatuses.map(statusLabel).join(", ")} invoices are hidden
              from this view — find them under All invoices.
            </p>
          ) : null}

          <div className="grid gap-3">
            <div className="relative">
              <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search by supplier, amount, date, invoice #, status…"
                className="bg-background pl-8"
              />
            </div>

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <div className="space-y-1.5">
                <Label htmlFor="supplier-filter">Supplier</Label>
                <MultiSelectFilter
                  id="supplier-filter"
                  allLabel="All suppliers"
                  noun="suppliers"
                  options={suppliers.map((supplier) => ({
                    value: supplier.id,
                    label: supplier.name,
                  }))}
                  selected={supplierFilter}
                  onToggle={(value) =>
                    toggleListParam("supplier", supplierFilter, value)
                  }
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="assignee-filter">Assigned to</Label>
                <MultiSelectFilter
                  id="assignee-filter"
                  allLabel="Anyone"
                  noun="assignees"
                  options={[
                    { value: "me", label: "Assigned to me" },
                    { value: "unassigned", label: "Unassigned" },
                    ...users.map((user) => ({
                      value: user.id,
                      label: userLabel(user),
                    })),
                  ]}
                  selected={assigneeFilter}
                  onToggle={(value) =>
                    toggleListParam("assignee", assigneeFilter, value)
                  }
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="status-filter">Status</Label>
                <MultiSelectFilter
                  id="status-filter"
                  allLabel="All statuses"
                  noun="statuses"
                  options={invoiceStatuses.map((status) => ({
                    value: status,
                    label: statusLabel(status),
                  }))}
                  selected={statusFilter}
                  onToggle={(value) => toggleListParam("status", statusFilter, value)}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="urgency-filter">Urgency</Label>
                <DropdownMenu>
                  <DropdownMenuTrigger
                    render={
                      <Button
                        id="urgency-filter"
                        type="button"
                        variant="outline"
                        className="w-full justify-between font-normal"
                      />
                    }
                  >
                    <span className="truncate">{URGENCY_LABELS[urgencyFilter]}</span>
                    <ChevronDownIcon className="size-4 shrink-0 text-muted-foreground" />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="min-w-48">
                    <DropdownMenuRadioGroup
                      value={urgencyFilter}
                      onValueChange={(value) =>
                        setParams({ urgency: value as string })
                      }
                    >
                      {URGENCY_FILTER_VALUES.map((value) => (
                        <DropdownMenuRadioItem key={value} value={value}>
                          {URGENCY_LABELS[value]}
                        </DropdownMenuRadioItem>
                      ))}
                    </DropdownMenuRadioGroup>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
          </div>
        </CardHeader>

        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <SortableHead
                  label="Supplier"
                  active={sortKey === "supplier"}
                  direction={sortDirection}
                  onSort={() => handleSort("supplier")}
                />
                <SortableHead
                  label="Status"
                  active={sortKey === "status"}
                  direction={sortDirection}
                  onSort={() => handleSort("status")}
                />
                <SortableHead
                  label="Total"
                  active={sortKey === "total"}
                  direction={sortDirection}
                  onSort={() => handleSort("total")}
                />
                <SortableHead
                  label="Assigned to"
                  active={sortKey === "assignee"}
                  direction={sortDirection}
                  onSort={() => handleSort("assignee")}
                />
                <SortableHead
                  label="Respond by"
                  active={sortKey === "respondBy"}
                  direction={sortDirection}
                  onSort={() => handleSort("respondBy")}
                />
                <SortableHead
                  label="Due"
                  active={sortKey === "due"}
                  direction={sortDirection}
                  onSort={() => handleSort("due")}
                />
                <TableHead>Alerts</TableHead>
                <TableHead>Docs</TableHead>
                <TableHead>Notes</TableHead>
                <SortableHead
                  label="Received"
                  active={sortKey === "received"}
                  direction={sortDirection}
                  onSort={() => handleSort("received")}
                />
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedInvoices.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={10} className="text-center text-muted-foreground">
                    {hasActiveFilters
                      ? "No invoices match your search or filters."
                      : "No invoices yet. Upload a PDF to start the pilot flow."}
                  </TableCell>
                </TableRow>
              ) : (
                sortedInvoices.map((invoice) => {
                  const deadlineInput = {
                    status: invoice.status,
                    createdAt: invoice.createdAt,
                    validatedAt: invoice.validatedAt,
                    dueDate: invoice.dueDate,
                    respondByDate: invoice.respondByDate,
                  };
                  const signals = getInvoiceDeadlineSignals(deadlineInput, now);
                  const respondBy = getRespondByDate(deadlineInput);
                  const isMine = invoice.assignedToId === currentUserId;
                  const isUrgentMine = needsMyUrgentAttention(
                    {
                      ...invoice,
                      createdAt: invoice.createdAt,
                      validatedAt: invoice.validatedAt,
                      dueDate: invoice.dueDate,
                    },
                    currentUserId,
                    now,
                  );
                  // Match the sheet's default view: logo/signature originals
                  // sit behind its "show more" toggle and don't count here.
                  const documentCount = invoice.documents.filter(
                    isDefaultVisibleDocument,
                  ).length;

                  return (
                    <TableRow
                      key={invoice.id}
                      className={cn(isUrgentMine && "bg-destructive/5")}
                    >
                      <TableCell>
                        <Link
                          href={`/invoices/${invoice.id}`}
                          className="font-medium hover:underline"
                        >
                          {supplierLabel(invoice)}
                        </Link>
                        {invoice.invoiceNumber ? (
                          <p className="text-xs text-muted-foreground">
                            {invoice.invoiceNumber}
                          </p>
                        ) : null}
                        {invoice.parseError ? (
                          <p className="text-xs text-destructive">
                            Parse issue: {invoice.parseError}
                          </p>
                        ) : null}
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={invoice.status} />
                      </TableCell>
                      <TableCell>
                        {formatCurrency(invoice.totalAmount, invoice.currency ?? "AUD")}
                      </TableCell>
                      <TableCell>
                        <span className={cn(isMine && "font-medium")}>
                          {invoice.assignedTo
                            ? userLabel(invoice.assignedTo)
                            : "Unassigned"}
                        </span>
                      </TableCell>
                      <TableCell>{formatDateOnly(respondBy)}</TableCell>
                      <TableCell>{formatDateOnly(invoice.dueDate)}</TableCell>
                      <TableCell>
                        <DeadlineBadges signals={signals} />
                      </TableCell>
                      <TableCell>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className={cn(
                            "h-auto gap-1 px-2 py-1",
                            documentCount === 0 && "text-muted-foreground",
                          )}
                          aria-label={`Open documents for ${supplierLabel(invoice)} (${documentCount})`}
                          onClick={() => setDocumentsInvoiceId(invoice.id)}
                        >
                          <PaperclipIcon className="size-3.5" />
                          {documentCount}
                        </Button>
                      </TableCell>
                      <TableCell>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className={cn(
                            "h-auto gap-1 px-2 py-1",
                            invoice.notes.length === 0 && "text-muted-foreground",
                          )}
                          aria-label={`Open notes for ${supplierLabel(invoice)} (${invoice.notes.length})`}
                          onClick={() => setNotesInvoiceId(invoice.id)}
                        >
                          <MessageSquareTextIcon className="size-3.5" />
                          {invoice.notes.length}
                        </Button>
                      </TableCell>
                      <TableCell>{formatDateOnly(invoice.createdAt)}</TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {documentsInvoice ? (
        <InvoiceDocumentsSheet
          supplierName={supplierLabel(documentsInvoice)}
          documents={documentsInvoice.documents}
          open
          onOpenChange={(open) => {
            if (!open) setDocumentsInvoiceId(null);
          }}
        />
      ) : null}

      {notesInvoice ? (
        <InvoiceNotesSheet
          invoiceId={notesInvoice.id}
          notes={notesInvoice.notes}
          canCompose
          currentUserId={currentUserId}
          open
          onOpenChange={(open) => {
            if (!open) setNotesInvoiceId(null);
          }}
        />
      ) : null}
    </div>
  );
}
