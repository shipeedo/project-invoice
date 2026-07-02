import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { isO365Configured } from "@/lib/o365/config";
import { buildMicrosoftAuthorizeUrl } from "@/lib/o365/oauth";
import { createO365OAuthState } from "@/lib/o365/oauth-state";

export async function GET() {
  const session = await auth();
  if (!session?.user?.organizationId || !session.user.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (!isO365Configured()) {
    return NextResponse.json(
      { error: "Microsoft OAuth is not configured (MS_CLIENT_ID / MS_CLIENT_SECRET)" },
      { status: 503 },
    );
  }

  const state = createO365OAuthState({
    organizationId: session.user.organizationId,
    userId: session.user.id,
  });

  const authorizeUrl = buildMicrosoftAuthorizeUrl(state);
  return NextResponse.redirect(authorizeUrl);
}
