import NextAuth from "next-auth";
import { authConfig } from "@/lib/auth.config";

export const { auth: middlewareAuth } = NextAuth(authConfig);

export default middlewareAuth((req) => {
  const isLoggedIn = !!req.auth;
  const isAuthRoute = req.nextUrl.pathname.startsWith("/login");
  const isApiAuth = req.nextUrl.pathname.startsWith("/api/auth");

  if (isApiAuth) return;

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
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
