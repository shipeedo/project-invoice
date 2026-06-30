import { NextResponse } from "next/server";
import { readFile } from "fs/promises";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { getUploadAbsolutePath } from "@/lib/uploads";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  const session = await auth();
  if (!session?.user?.organizationId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;
  const invoice = await db.invoice.findFirst({
    where: { id, organizationId: session.user.organizationId },
  });

  if (!invoice?.filePath) {
    return NextResponse.json({ error: "File not found" }, { status: 404 });
  }

  const absolutePath = getUploadAbsolutePath(invoice.filePath);
  const buffer = await readFile(absolutePath);

  return new NextResponse(buffer, {
    headers: {
      "Content-Type": invoice.fileMimeType ?? "application/pdf",
      "Content-Disposition": `inline; filename="${invoice.originalFileName ?? "invoice.pdf"}"`,
    },
  });
}
