import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { updateCreditRequestStatus } from "@/lib/credit-requests";
import { recordCreditRequestOutcome } from "@/lib/credit-lines";
import { creditRequests, db } from "@/lib/db";
import type { CarrierDecision, CreditRequestStatus } from "@/lib/db/types";
import {
  CREDIT_NOTE_UPLOAD_EXTENSIONS,
  hasAllowedExtension,
} from "@/lib/invoice-documents";
import { saveUploadedFile } from "@/lib/uploads";

type RouteContext = {
  params: Promise<{ id: string }>;
};

type PatchBody = {
  status?: CreditRequestStatus;
  carrierDecision?: CarrierDecision;
  approvedAmount?: number | null;
  action?:
    | "contest"
    | "approve"
    | "reject"
    | "carrier_approved"
    | "carrier_denied"
    | "record_outcome";
  outcome?: "approved" | "denied";
};

export async function PATCH(request: Request, context: RouteContext) {
  const session = await auth();
  if (!session?.user?.organizationId || !session.user.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;

  // Record-outcome submissions arrive as multipart so the received credit
  // note file(s) can ride along; everything else stays JSON.
  let body: PatchBody;
  let files: File[] = [];
  let note: string | null = null;

  const contentType = request.headers.get("content-type") ?? "";
  if (contentType.includes("multipart/form-data")) {
    const formData = await request.formData();
    const approvedRaw = formData.get("approvedAmount");
    const approvedAmount =
      typeof approvedRaw === "string" && approvedRaw.trim() !== ""
        ? Number(approvedRaw)
        : undefined;
    body = {
      action: (formData.get("action") ?? undefined) as PatchBody["action"],
      outcome: (formData.get("outcome") ?? undefined) as PatchBody["outcome"],
      approvedAmount:
        approvedAmount != null && Number.isFinite(approvedAmount)
          ? approvedAmount
          : undefined,
    };
    files = formData
      .getAll("files")
      .filter((entry): entry is File => entry instanceof File && entry.size > 0);
    const noteValue = formData.get("note");
    note = typeof noteValue === "string" && noteValue.trim() ? noteValue.trim() : null;
  } else {
    body = (await request.json()) as PatchBody;
  }

  for (const file of files) {
    if (!hasAllowedExtension(file.name, CREDIT_NOTE_UPLOAD_EXTENSIONS)) {
      return NextResponse.json(
        { error: "Supported credit note uploads: PDF, CSV, XLSX, and XLS" },
        { status: 400 },
      );
    }
  }

  const existing = await db.query.creditRequests.findFirst({
    where: and(
      eq(creditRequests.id, id),
      eq(creditRequests.organizationId, session.user.organizationId),
    ),
  });

  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (body.action === "record_outcome") {
    if (body.outcome !== "approved" && body.outcome !== "denied") {
      return NextResponse.json({ error: "outcome must be approved or denied" }, { status: 400 });
    }

    const attachments = [];
    for (const file of files) {
      const saved = await saveUploadedFile(file);
      attachments.push({
        fileName: file.name,
        filePath: saved.storedPath,
        mimeType: saved.mimeType,
        size: saved.size,
      });
    }

    const outcome = await recordCreditRequestOutcome({
      organizationId: session.user.organizationId,
      userId: session.user.id,
      creditRequestId: id,
      outcome: body.outcome,
      approvedAmount: body.approvedAmount,
      attachments,
      note,
    });

    if ("error" in outcome) {
      return NextResponse.json({ error: outcome.error }, { status: 400 });
    }

    return NextResponse.json(outcome.creditRequest);
  }

  let status = body.status;
  let carrierDecision = body.carrierDecision ?? existing.carrierDecision;

  switch (body.action) {
    case "carrier_approved":
      carrierDecision = "APPROVED";
      status = "AWAITING_USER";
      break;
    case "carrier_denied":
      carrierDecision = "DENIED";
      status = "AWAITING_USER";
      break;
    case "approve":
      status = "APPROVED";
      break;
    case "reject":
      status = "REJECTED";
      break;
    case "contest":
      status = "CONTESTED";
      break;
    default:
      break;
  }

  if (!status) {
    return NextResponse.json({ error: "status or action is required" }, { status: 400 });
  }

  const outcome = await updateCreditRequestStatus({
    organizationId: session.user.organizationId,
    userId: session.user.id,
    creditRequestId: id,
    status,
    carrierDecision,
  });

  if ("error" in outcome && outcome.error) {
    return NextResponse.json({ error: outcome.error }, { status: 400 });
  }

  return NextResponse.json(outcome.creditRequest);
}
