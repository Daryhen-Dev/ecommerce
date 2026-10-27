// Middleware guard for the admin panel (Next.js 16 still supports the
// `middleware` file convention; it is aliased to `proxy` and defaults to the
// Node.js runtime, so `node:crypto` is available here).
//
// It is a fast gate, not the security boundary: `/admin` re-verifies the
// session in its layout, because Server Actions and matcher changes can skip
// the middleware. A missing AUTH_SECRET means "not authenticated" here; the
// login page then renders the configuration error instead of a redirect loop.

import { NextResponse, type NextRequest } from "next/server";

import { ADMIN_SESSION_COOKIE, verifyAdminSessionToken } from "@/lib/admin-auth";

const LOGIN_PATH = "/admin/login";

export function middleware(request: NextRequest): NextResponse {
  const { pathname, search } = request.nextUrl;

  if (pathname === LOGIN_PATH) {
    return NextResponse.next();
  }

  const token = request.cookies.get(ADMIN_SESSION_COOKIE)?.value;
  if (verifyAdminSessionToken(token)) {
    return NextResponse.next();
  }

  const loginUrl = new URL(LOGIN_PATH, request.url);
  loginUrl.searchParams.set("next", `${pathname}${search}`);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  // Node runtime: the session signature uses `node:crypto`, which is not
  // available in the Edge runtime.
  runtime: "nodejs",
  matcher: ["/admin", "/admin/:path*"],
};
