import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function PATCH(request: Request, context: RouteContext) {
  const session = await auth();
  if (!session?.user?.organizationId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await context.params;
  const body = (await request.json()) as {
    name?: string;
    emailAddresses?: string[];
    emailDomains?: string[];
  };

  const existing = await db.supplier.findFirst({
    where: { id, organizationId: session.user.organizationId },
  });

  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const supplier = await db.supplier.update({
    where: { id },
    data: {
      name: body.name?.trim(),
      emailAddresses: body.emailAddresses
        ? JSON.stringify(body.emailAddresses)
        : undefined,
      emailDomains: body.emailDomains ? JSON.stringify(body.emailDomains) : undefined,
    },
  });

  return NextResponse.json({
    ...supplier,
    emailAddresses: JSON.parse(supplier.emailAddresses),
    emailDomains: JSON.parse(supplier.emailDomains),
  });
}

export async function DELETE(_request: Request, context: RouteContext) {
  const session = await auth();
  if (!session?.user?.organizationId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await context.params;
  const existing = await db.supplier.findFirst({
    where: { id, organizationId: session.user.organizationId },
  });

  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await db.supplier.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
