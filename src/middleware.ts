import { NextRequest, NextResponse } from "next/server";

/**
 * Interim access gate (until real auth lands in Phase 2).
 *
 * If SITE_PASSWORD is set, the whole app sits behind HTTP Basic Auth so the
 * public deploy doesn't expose health data to anyone with the URL. If the env
 * var is NOT set (e.g. local dev), the gate is disabled and nothing changes.
 *
 * Exemptions: build assets, the PWA files (so the icon/manifest/SW load before
 * you authenticate), and the external key-authed sync endpoints (Health Auto
 * Export POSTs there with HEALTHKIT_SYNC_KEY — it can't do a Basic Auth prompt).
 */
function isExempt(pathname: string): boolean {
  if (pathname.startsWith("/_next")) return true;
  if (pathname.startsWith("/api/healthkit-sync")) return true; // key-authed, external
  // PWA + static files (sw.js, icons, manifest, fonts, favicon)
  if (/\.(?:png|svg|ico|webmanifest|js|txt|woff2?|json)$/.test(pathname)) return true;
  return false;
}

export function middleware(req: NextRequest) {
  const pw = process.env.SITE_PASSWORD;
  if (!pw) return NextResponse.next(); // gate disabled when unset

  if (isExempt(req.nextUrl.pathname)) return NextResponse.next();

  const auth = req.headers.get("authorization");
  if (auth?.startsWith("Basic ")) {
    try {
      const decoded = atob(auth.slice(6));
      const pass = decoded.slice(decoded.indexOf(":") + 1);
      if (pass === pw) return NextResponse.next();
    } catch {
      /* fall through to 401 */
    }
  }

  return new NextResponse("Authentication required", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="Baseline", charset="UTF-8"' },
  });
}

export const config = {
  // Run on everything except Next's internal static pipeline.
  matcher: ["/((?!_next/static|_next/image).*)"],
};
