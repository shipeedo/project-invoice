import { asc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db, suppliers } from "@/lib/db";
import { buildNewSupplierValues } from "@/lib/supplier-extraction";
import { parseSupplierFieldMappings } from "@/lib/extraction-types";

export async function GET() {
  const session = await auth();
  if (!session?.user?.organizationId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rows = await db.query.suppliers.findMany({
    where: eq(suppliers.organizationId, session.user.organizationId),
    orderBy: asc(suppliers.name),
  });

  return NextResponse.json(
    rows.map((supplier) => ({
      ...supplier,
      emailAddresses: JSON.parse(supplier.emailAddresses) as string[],
      emailDomains: JSON.parse(supplier.emailDomains) as string[],
      fieldMappings: parseSupplierFieldMappings(supplier.fieldMappings),
    })),
  );
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.organizationId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = (await request.json()) as {
    name: string;
    emailAddresses?: string[];
    emailDomains?: string[];
  };

  if (!body.name?.trim()) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }

  const [supplier] = await db
    .insert(suppliers)
    .values(
      buildNewSupplierValues({
        organizationId: session.user.organizationId,
        name: body.name.trim(),
        emailAddresses: body.emailAddresses,
        emailDomains: body.emailDomains,
      }),
    )
    .returning();

  return NextResponse.json(
    {
      ...supplier,
      emailAddresses: body.emailAddresses ?? [],
      emailDomains: body.emailDomains ?? [],
      fieldMappings: parseSupplierFieldMappings(supplier.fieldMappings),
    },
    { status: 201 },
  );
}
