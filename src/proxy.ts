import { NextRequest, NextResponse } from "next/server";

const publicRoutes = ["/", "/login", "/register"];

export function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname;

  // Allow public routes
  if (publicRoutes.includes(path)) {
    return NextResponse.next();
  }

  // Allow API auth routes (NextAuth needs these)
  if (path.startsWith("/api/auth")) {
    return NextResponse.next();
  }

  // Allow register API (needed before login)
  if (path === "/api/register") {
    return NextResponse.next();
  }

  // Check for NextAuth session cookie (optimistic check)
  const sessionToken =
    request.cookies.get("authjs.session-token")?.value ||
    request.cookies.get("__Secure-authjs.session-token")?.value;

  if (!sessionToken) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|logo.png|.*\\.png$).*)"],
};
