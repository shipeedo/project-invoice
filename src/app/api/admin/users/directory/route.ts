import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { fetchTenantUsers, TenantApiError } from "@/lib/tenant-api";

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.organizationId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (!session.accessToken) {
    // The tenant access token is captured only at sign-in, so sessions created
    // before this feature (or via mock login, which has no OIDC token) lack it.
    return NextResponse.json(
      {
        error:
          "Your session doesn't include a tenant API token. Sign out and sign back in to load the directory, or add users by email below. (With mock login the directory is never available.)",
      },
      { status: 424 },
    );
  }

  const url = new URL(request.url);
  try {
    const result = await fetchTenantUsers({
      accessToken: session.accessToken,
      requestOrigin: url.origin,
      filter: url.searchParams.get("filter") ?? undefined,
    });
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof TenantApiError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }
}
