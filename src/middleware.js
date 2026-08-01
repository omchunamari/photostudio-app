import { NextResponse } from "next/server";

const ALLOWED_IPS = (process.env.OFFICE_ALLOWED_IPS || "")
  .split(",")
  .map((ip) => ip.trim())
  .filter(Boolean);

// Routes that owner/admin can hit from anywhere (mobile/remote)
const MOBILE_ALLOWED_PATHS = ["/api/mobile", "/mobile"];

export function middleware(request) {
  const path = request.nextUrl.pathname;

  // Let public/auth pages and mobile-allowed routes pass without IP check.
  // Role-based mobile access (admin/owner) is enforced later in the auth layer,
  // this middleware only handles the network-level office restriction.
  if (
    path.startsWith("/login") ||
    path.startsWith("/_next") ||
    path.startsWith("/api/auth") ||
    path.startsWith("/access-denied") ||
    MOBILE_ALLOWED_PATHS.some((p) => path.startsWith(p))
  ) {
    return NextResponse.next();
  }

  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0].trim() ||
    request.headers.get("x-real-ip") ||
    "";

  if (ALLOWED_IPS.length && !ALLOWED_IPS.includes(ip)) {
    return NextResponse.redirect(new URL("/access-denied", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};