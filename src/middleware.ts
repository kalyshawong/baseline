import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";

/**
 * Access gate — Auth.js sessions first, legacy gates as transition fallbacks.
 *
 * Order of acceptance:
 *   1. Valid Auth.js JWT session cookie (the real mechanism)
 *   2. Native-shell UA token (until the iOS webview has a proven login session)
 *   3. Legacy HTTP Basic passcode (SITE_PASSWORD — kept during migration;
 *      remove once login is verified everywhere)
 *
 * Unauthenticated page requests redirect to /login; API requests get 401.
 * When SITE_PASSWORD is unset (local dev), the gate is disabled entirely.
 *
 * NOTE edge runtime: we verify the JWT via getToken (no DB, no Prisma) —
 * importing the full auth config here would pull Node-only deps into edge.
 */
function isExempt(pathname: string): boolean {
  if (pathname.startsWith("/_next")) return true;
  if (pathname.startsWith("/api/healthkit-sync")) return true; // key-authed, external
  if (pathname === "/api/keepalive") return true; // Vercel cron; leaks nothing
  if (pathname === "/login") return true;
  if (pathname.startsWith("/api/auth")) return true; // NextAuth + Oura OAuth callbacks
  // PWA + static files (sw.js, icons, manifest, fonts, favicon)
  if (/\.(?:png|svg|ico|webmanifest|js|txt|woff2?|json)$/.test(pathname)) return true;
  return false;
}

export async function middleware(req: NextRequest) {
  const pw = process.env.SITE_PASSWORD;
  if (!pw) return NextResponse.next(); // gate disabled when unset (local dev)

  if (isExempt(req.nextUrl.pathname)) return NextResponse.next();

  // 1) Auth.js session
  const secret = process.env.AUTH_SECRET;
  if (secret) {
    try {
      const token = await getToken({
        req,
        secret,
        secureCookie: req.nextUrl.protocol === "https:",
      });
      if (token) return NextResponse.next();
    } catch {
      /* fall through to legacy gates */
    }
  }

  // 2) Native iOS shell UA token (transition — see capacitor.config.ts)
  const uaToken = process.env.NATIVE_APP_UA_TOKEN;
  if (uaToken && (req.headers.get("user-agent") ?? "").includes(uaToken)) {
    return NextResponse.next();
  }

  // 3) Legacy Basic-Auth passcode (transition)
  const authHeader = req.headers.get("authorization");
  if (authHeader?.startsWith("Basic ")) {
    try {
      const decoded = atob(authHeader.slice(6));
      const pass = decoded.slice(decoded.indexOf(":") + 1);
      if (pass === pw) return NextResponse.next();
    } catch {
      /* fall through */
    }
  }

  // Unauthenticated: APIs get 401, pages go to /login.
  if (req.nextUrl.pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const loginUrl = new URL("/login", req.url);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  // Run on everything except Next's internal static pipeline.
  matcher: ["/((?!_next/static|_next/image).*)"],
};
