"use client";

import Link from "next/link";
import { useState } from "react";
import { CreditOutcomeDialog } from "@/components/credit-outcome-dialog";
import { CreditRequestSheet } from "@/components/credit-request-sheet";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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

type InvoiceCreditRequest = {
  id: string;
  status: CreditRequestStatus;
  carrierDecision: CarrierDecision | null;
  subject: string;
  requestedTotal: number | null;
  approvedAmount: number | null;
  lineItems: string;
  createdAt: string;
};

type InvoiceCreditsSectionProps = {
  invoiceId: string;
  creditRequests: InvoiceCreditRequest[];
  currency: string;
  /** Enables the "Request credit" button; off for trashed/cancelled invoices. */
  canRequestCredit: boolean;
};

export function InvoiceCreditsSection({
  invoiceId,
  creditRequests,
  currency,
  canRequestCredit,
}: InvoiceCreditsSectionProps) {
  const [outcomeFor, setOutcomeFor] = useState<InvoiceCreditRequest | null>(null);
  const [requestOpen, setRequestOpen] = useState(false);

  if (creditRequests.length === 0 && !canRequestCredit) {
    return null;
  }

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-4">
          <CardTitle>Credit requests</CardTitle>
          <div className="flex flex-wrap items-center gap-2">
            {canRequestCredit ? (
              <Button size="sm" onClick={() => setRequestOpen(true)}>
                Request credit
              </Button>
            ) : null}
            <Link href="/credits" className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>
              View all credits
            </Link>
          </div>
        </CardHeader>
        <CardContent>
          {creditRequests.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No credit requests yet. Use Request credit to build a carrier
              submission for charges on this invoice.
            </p>
          ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Subject</TableHead>
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
                const lineCount = parseCreditRequestLineItems(request.lineItems).length;
                const open = isCreditRequestOpen(request.status);

                return (
                  <TableRow key={request.id}>
                    <TableCell>{request.subject}</TableCell>
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
                    <TableCell>{formatDate(request.createdAt)}</TableCell>
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
          )}
        </CardContent>
      </Card>

      <CreditRequestSheet
        open={requestOpen}
        onOpenChange={setRequestOpen}
        invoiceId={invoiceId}
        currency={currency}
      />

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
