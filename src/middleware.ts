import NextAuth from "next-auth";
import { authConfig } from "@/lib/auth.config";

export const { auth: middlewareAuth } = NextAuth(authConfig);

export default middlewareAuth((req) => {
  const isLoggedIn = !!req.auth;
  const isAuthRoute = req.nextUrl.pathname.startsWith("/login");
  const isApiAuth = req.nextUrl.pathname.startsWith("/api/auth");
  const isApiCron = req.nextUrl.pathname.startsWith("/api/cron");
  const isO365Callback = req.nextUrl.pathname.startsWith("/api/o365/callback");

  if (isApiAuth || isApiCron || isO365Callback) return;

  if (!isLoggedIn && !isAuthRoute) {
    const loginUrl = new URL("/login", req.nextUrl.origin);
    loginUrl.searchParams.set("callbackUrl", req.nextUrl.pathname);
    return Response.redirect(loginUrl);
  }

  if (isLoggedIn && isAuthRoute) {
    return Response.redirect(new URL("/", req.nextUrl.origin));
  }
});

export const config = {
  // sw.js, the manifest, and icons are excluded so the browser can always
  // fetch them anonymously (SW updates and manifest requests don't carry
  // auth) without being bounced to the login page.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|sw.js|manifest.webmanifest|icons/).*)",
  ],
};
