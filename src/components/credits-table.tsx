"use client";

import Link from "next/link";
import { useState } from "react";
import { CreditOutcomeDialog } from "@/components/credit-outcome-dialog";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { CarrierDecision, CreditRequestStatus } from "@/lib/db/types";
import { isCreditRequestOpen, parseCreditRequestLineItems, resolveDefaultApprovedAmount } from "@/lib/credit-line-utils";
import { formatCurrency, formatDate, statusLabel } from "@/lib/format";
import { cn } from "@/lib/utils";

export type CreditRequestRow = {
  id: string;
  status: CreditRequestStatus;
  carrierDecision: CarrierDecision | null;
  subject: string;
  requestedTotal: number | null;
  approvedAmount: number | null;
  lineItems: string;
  createdAt: string;
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
              <TableHead>Status</TableHead>
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
                    <div className="flex flex-wrap gap-2">
                      <Badge variant="secondary">{statusLabel(request.status)}</Badge>
                      {request.carrierDecision ? (
                        <Badge variant="outline">
                          Carrier {request.carrierDecision.toLowerCase()}
                        </Badge>
                      ) : null}
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    {request.requestedTotal != null
                      ? formatCurrency(request.requestedTotal, currency)
                      : "—"}
                  </TableCell>
                  <TableCell className="text-right">
                    {request.approvedAmount != null
                      ? formatCurrency(request.approvedAmount, currency)
                      : "—"}
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
          defaultApprovedAmount={resolveDefaultApprovedAmount(
            outcomeFor.requestedTotal,
            outcomeFor.lineItems,
          )}
        />
      ) : null}
    </>
  );
}
