import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { DEMO_USER_ID } from "@/lib/demo/constants";

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
/**
 * Public demo sessions are read-only. Layer 1 of 3 (see demo/constants.ts):
 * refuse every mutating request here, before any route code runs. The coach
 * POST is let through because that route answers demo sessions with a canned
 * reply and writes nothing. Device-linking and sync entry points are refused
 * even as GETs.
 */
function demoRefusal(req: NextRequest): NextResponse | null {
  const { pathname } = req.nextUrl;
  const method = req.method.toUpperCase();
  const blockedGet =
    pathname.startsWith("/api/auth/oura") || pathname.startsWith("/api/sync");
  const mutating = !["GET", "HEAD", "OPTIONS"].includes(method);
  const allowedPost =
    pathname === "/api/coach" || pathname.startsWith("/api/auth/");
  if (blockedGet || (mutating && !allowedPost)) {
    return NextResponse.json(
      { error: "This is a read-only demo — changes aren't saved." },
      { status: 403 },
    );
  }
  return null;
}

function isExempt(pathname: string): boolean {
  if (pathname.startsWith("/_next")) return true;
  if (pathname.startsWith("/api/healthkit-sync")) return true; // key-authed, external
  if (pathname === "/api/keepalive") return true; // Vercel cron; leaks nothing
  if (pathname === "/api/version") return true; // build sha only; staleness check
  if (pathname === "/login") return true;
  if (pathname === "/signup") return true; // invite-gated; the code is the gate
  if (pathname === "/demo") return true; // public demo entry — signs into the read-only demo tenant
  if (pathname === "/api/demo/reseed") return true; // Vercel cron; self-rate-limited, touches only the demo tenant
  if (pathname.startsWith("/api/auth")) return true; // NextAuth + Oura OAuth callbacks
  // PWA + static files (sw.js, icons, manifest, fonts, favicon)
  if (/\.(?:png|svg|ico|webmanifest|js|txt|woff2?|json)$/.test(pathname)) return true;
  return false;
}

export async function middleware(req: NextRequest) {
  // Resolve the session first: the demo read-only rule applies everywhere,
  // including exempt paths and local dev with the gate off.
  const secret = process.env.AUTH_SECRET;
  let token: Awaited<ReturnType<typeof getToken>> = null;
  if (secret) {
    try {
      token = await getToken({
        req,
        secret,
        secureCookie: req.nextUrl.protocol === "https:",
      });
    } catch {
      /* treated as no session */
    }
  }
  if (token?.userId === DEMO_USER_ID) {
    const refusal = demoRefusal(req);
    if (refusal) return refusal;
  }

  const pw = process.env.SITE_PASSWORD;
  if (!pw) return NextResponse.next(); // gate disabled when unset (local dev)

  if (isExempt(req.nextUrl.pathname)) return NextResponse.next();

  // 1) Auth.js session
  if (token) return NextResponse.next();

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
