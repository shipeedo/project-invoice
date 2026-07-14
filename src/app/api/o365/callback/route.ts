import { NextResponse } from "next/server";
import { getAppOrigin } from "@/lib/app-url";
import { upsertO365Connection } from "@/lib/o365/connection";
import { exchangeMicrosoftCode } from "@/lib/o365/oauth";
import { parseO365OAuthState } from "@/lib/o365/oauth-state";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");
  const errorDescription = url.searchParams.get("error_description");

  const redirectBase = new URL("/admin/o365", getAppOrigin(url.origin));

  if (error) {
    redirectBase.searchParams.set(
      "error",
      errorDescription ?? error,
    );
    return NextResponse.redirect(redirectBase);
  }

  if (!code || !state) {
    redirectBase.searchParams.set("error", "Missing OAuth response");
    return NextResponse.redirect(redirectBase);
  }

  const parsedState = parseO365OAuthState(state);
  if ("error" in parsedState && parsedState.error) {
    redirectBase.searchParams.set("error", parsedState.error);
    return NextResponse.redirect(redirectBase);
  }

  try {
    const tokens = await exchangeMicrosoftCode(code);
    await upsertO365Connection({
      organizationId: parsedState.state!.organizationId,
      userId: parsedState.state!.userId,
      tokens,
    });
    redirectBase.searchParams.set("connected", "1");
  } catch (callbackError) {
    redirectBase.searchParams.set(
      "error",
      callbackError instanceof Error
        ? callbackError.message
        : "Failed to connect Office 365",
    );
  }

  return NextResponse.redirect(redirectBase);
}
