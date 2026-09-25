import { auth } from "@/auth";
import { DEMO_USER_ID } from "@/lib/demo/constants";

/**
 * One-line strip shown only to public demo sessions, so nobody mistakes the
 * demo tenant's numbers for a real person's live data. Deliberately plain —
 * existing tokens only; visual treatment is Kalysha's to restyle.
 */
export async function DemoBanner() {
  let isDemo = false;
  try {
    const session = (await auth()) as { userId?: string } | null;
    isDemo = session?.userId === DEMO_USER_ID;
  } catch {
    /* no request scope / auth unavailable → not a demo session */
  }
  if (!isDemo) return null;
  return (
    <div
      role="status"
      className="ov flex items-center justify-center px-4 py-2 text-center"
      style={{
        background: "var(--color-surface-2)",
        borderBottom: "1px solid var(--color-border)",
        whiteSpace: "normal",
      }}
    >
      Demo · sample data · read-only ·{" "}
      <a href="/login" style={{ textDecoration: "underline" }}>
        Sign in
      </a>
    </div>
  );
}
