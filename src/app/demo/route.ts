import { NextResponse, type NextRequest } from "next/server";
import { auth, signIn } from "@/auth";
import { DEMO_USER_ID } from "@/lib/demo/constants";

/**
 * Public demo entry: GET /demo → signed into the read-only demo tenant → "/".
 *
 * No password, no invite. The session this creates can only ever be the demo
 * tenant (see the "demo" provider in src/auth.ts), and that tenant can't
 * write anything (middleware + db.ts + coach route).
 *
 * If the visitor already has a real account session, leave it alone —
 * opening the demo link must never log Kalysha (or a tester) out of their
 * own data. Use a private window to view the demo while signed in.
 */
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const session = (await auth()) as { userId?: string } | null;
  if (session?.userId && session.userId !== DEMO_USER_ID) {
    return NextResponse.redirect(new URL("/", req.url));
  }
  // Throws NEXT_REDIRECT on success, which Next turns into the redirect.
  await signIn("demo", { redirectTo: "/" });
  return NextResponse.redirect(new URL("/", req.url));
}
