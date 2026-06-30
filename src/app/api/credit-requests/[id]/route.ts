import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { updateCreditRequestStatus } from "@/lib/credit-requests";
import { creditRequests, db } from "@/lib/db";
import type { CarrierDecision, CreditRequestStatus } from "@/lib/db/types";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function PATCH(request: Request, context: RouteContext) {
  const session = await auth();
  if (!session?.user?.organizationId || !session.user.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;
  const body = (await request.json()) as {
    status?: CreditRequestStatus;
    carrierDecision?: CarrierDecision;
    action?: "contest" | "approve" | "reject" | "carrier_approved" | "carrier_denied";
  };

  const existing = await db.query.creditRequests.findFirst({
    where: and(
      eq(creditRequests.id, id),
      eq(creditRequests.organizationId, session.user.organizationId),
    ),
  });

  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
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
