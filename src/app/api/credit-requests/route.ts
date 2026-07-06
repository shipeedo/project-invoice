import { desc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { creditRequests, db } from "@/lib/db";

export async function GET() {
  const session = await auth();
  if (!session?.user?.organizationId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rows = await db.query.creditRequests.findMany({
    where: eq(creditRequests.organizationId, session.user.organizationId),
    with: {
      invoice: {
        columns: {
          id: true,
          vendorName: true,
          invoiceNumber: true,
          originalFileName: true,
          currency: true,
        },
      },
      createdBy: { columns: { id: true, name: true, email: true } },
    },
    orderBy: desc(creditRequests.createdAt),
  });

  return NextResponse.json({ creditRequests: rows });
}
