import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getSupplierSuggestions } from "@/lib/email-contacts";

export async function GET() {
  const session = await auth();
  if (!session?.user?.organizationId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const suggestions = await getSupplierSuggestions(session.user.organizationId);
  return NextResponse.json({ suggestions });
}
