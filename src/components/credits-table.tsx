"use client";

import Link from "next/link";
import { useState } from "react";
import { CreditOutcomeDialog } from "@/components/credit-outcome-dialog";
import { CreditStatusBadge } from "@/components/credit-status-badge";
import { CreditSubmitButton } from "@/components/credit-submit-button";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { CreditRequestStatus } from "@/lib/db/types";
import {
  creditShortfall,
  isCreditRequestOpen,
  parseCreditRequestLineItems,
  resolveRequestedTotal,
} from "@/lib/credit-line-utils";
import { formatCurrency, formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";

export type CreditRequestRow = {
  id: string;
  status: CreditRequestStatus;
  subject: string;
  requestedTotal: number | null;
  approvedAmount: number | null;
  lineItems: string;
  createdAt: string;
  submittedAt: string | null;
  invoice: {
    id: string;
    vendorName: string | null;
    invoiceNumber: string | null;
    originalFileName: string | null;
    currency: string | null;
  };
  createdBy: {
    name: string | null;
    email: string;
  };
};

function invoiceLabel(invoice: CreditRequestRow["invoice"]) {
  return invoice.vendorName ?? invoice.invoiceNumber ?? invoice.originalFileName ?? "Invoice";
}

export function CreditsTable({ creditRequests }: { creditRequests: CreditRequestRow[] }) {
  const [outcomeFor, setOutcomeFor] = useState<CreditRequestRow | null>(null);

  if (creditRequests.length === 0) {
    return <p className="text-sm text-muted-foreground">No credit requests yet.</p>;
  }

  return (
    <>
      <div className="rounded-xl border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Invoice</TableHead>
              <TableHead>Lines</TableHead>
              <TableHead>Credit status</TableHead>
              <TableHead className="text-right">Requested</TableHead>
              <TableHead className="text-right">Approved</TableHead>
              <TableHead>Created</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {creditRequests.map((request) => {
              const currency = request.invoice.currency ?? "AUD";
              const lineCount = parseCreditRequestLineItems(request.lineItems).length;
              const open = isCreditRequestOpen(request.status);
              const shortfall = creditShortfall(request);

              return (
                <TableRow key={request.id}>
                  <TableCell>
                    <div className="space-y-1">
                      <Link
                        href={`/invoices/${request.invoice.id}`}
                        className="font-medium hover:underline"
                      >
                        {invoiceLabel(request.invoice)}
                      </Link>
                      {request.invoice.invoiceNumber ? (
                        <p className="text-xs text-muted-foreground">
                          {request.invoice.invoiceNumber}
                        </p>
                      ) : null}
                    </div>
                  </TableCell>
                  <TableCell>{lineCount || "—"}</TableCell>
                  <TableCell>
                    <div className="space-y-1">
                      <CreditStatusBadge status={request.status} />
                      {request.submittedAt ? (
                        <p className="text-xs text-muted-foreground">
                          Sent {formatDate(request.submittedAt)}
                        </p>
                      ) : null}
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    {request.requestedTotal != null
                      ? formatCurrency(request.requestedTotal, currency)
                      : "—"}
                  </TableCell>
                  <TableCell className="text-right">
                    {request.approvedAmount != null ? (
                      <div className="space-y-1">
                        <p>{formatCurrency(request.approvedAmount, currency)}</p>
                        {shortfall != null ? (
                          <p className="text-xs text-amber-700 dark:text-amber-400">
                            {formatCurrency(shortfall, currency)} short
                          </p>
                        ) : null}
                      </div>
                    ) : (
                      "—"
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="text-sm">
                      <p>{formatDate(request.createdAt)}</p>
                      <p className="text-xs text-muted-foreground">
                        {request.createdBy.name ?? request.createdBy.email}
                      </p>
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <a
                        href={`/api/credit-requests/${request.id}/download`}
                        className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
                      >
                        Download spreadsheet
                      </a>
                      {request.status === "PENDING" ? (
                        <CreditSubmitButton creditRequestId={request.id} />
                      ) : null}
                      {open ? (
                        <Button size="sm" onClick={() => setOutcomeFor(request)}>
                          Record outcome
                        </Button>
                      ) : null}
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {outcomeFor ? (
        <CreditOutcomeDialog
          open={Boolean(outcomeFor)}
          onOpenChange={(open) => {
            if (!open) setOutcomeFor(null);
          }}
          creditRequestId={outcomeFor.id}
          currency={outcomeFor.invoice.currency ?? "AUD"}
          requestedTotal={resolveRequestedTotal(
            outcomeFor.requestedTotal,
            outcomeFor.lineItems,
          )}
        />
      ) : null}
    </>
  );
}
