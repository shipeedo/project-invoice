import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import {
  createSupplierFromEmailContact,
  linkSupplierToThreadsAndMessages,
} from "@/lib/email-contacts";

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.organizationId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = (await request.json()) as { contactId?: string; name?: string };
  if (!body.contactId) {
    return NextResponse.json({ error: "contactId is required" }, { status: 400 });
  }

  const outcome = await createSupplierFromEmailContact({
    organizationId: session.user.organizationId,
    contactId: body.contactId,
    name: body.name,
  });

  if ("error" in outcome && outcome.error) {
    return NextResponse.json({ error: outcome.error }, { status: 400 });
  }

  const email = JSON.parse(outcome.supplier!.emailAddresses)[0] as string | undefined;
  if (email) {
    await linkSupplierToThreadsAndMessages({
      organizationId: session.user.organizationId,
      supplierId: outcome.supplier!.id,
      email,
    });
  }

  return NextResponse.json(
    {
      ...outcome.supplier,
      emailAddresses: JSON.parse(outcome.supplier!.emailAddresses),
      emailDomains: JSON.parse(outcome.supplier!.emailDomains),
      existing: outcome.existing,
    },
    { status: outcome.existing ? 200 : 201 },
  );
}
