import { NextRequest, NextResponse } from "next/server";

// Paths to protect. Add more routes as needed.
const PROTECTED_PREFIXES = [
  "/dashboard",
  "/visualizer",
  "/linkedList",
  "/queue",
  "/stack",
  "/graph",
  "/trees",
];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  const isProtected = PROTECTED_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(p + "/"),
  );

  if (!isProtected) return NextResponse.next();

  // Forward the incoming Cookie header to our internal auth check so the
  // server-side session (HttpOnly cookies) can be validated by the already
  // implemented /api/auth endpoint.
  const cookieHeader = req.headers.get("cookie") || "";

  try {
    const authRes = await fetch(`${req.nextUrl.origin}/api/auth`, {
      headers: { cookie: cookieHeader },
      // prevent caching of the ephemeral auth check
      cache: "no-store",
    });

    if (authRes.ok) {
      const data = await authRes.json();
      if (data?.authenticated) return NextResponse.next();
    }
  } catch (err) {
    // Treat errors as unauthenticated — we'll redirect to login below.
    console.error("Middleware auth check failed:", err);
  }

  const loginUrl = new URL("/login", req.nextUrl.origin);
  loginUrl.searchParams.set("from", pathname);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/visualizer/:path*",
    "/linkedList/:path*",
    "/queue/:path*",
    "/stack/:path*",
    "/graph/:path*",
    "/trees/:path*",
  ],
};
