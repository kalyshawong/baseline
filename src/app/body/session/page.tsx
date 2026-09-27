import { redirect } from "next/navigation";
import { getIntakeStatus } from "@/lib/intake";
import { buildSessionPlan } from "@/lib/strength/session-plan";
import { SessionLog } from "@/components/strength/session-log";
import "@/app/strength.css";

export const dynamic = "force-dynamic";

/**
 * /body/session?template=Push%20A — the in-session strength log
 * (design_handoff_baseline_ios_strength, screen 1). Full-screen layer over
 * the app shell; Finish shows the session summary.
 */
export default async function SessionPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { needsOnboarding } = await getIntakeStatus();
  if (needsOnboarding) redirect("/onboarding");
  const params = await searchParams;
  const raw = typeof params.template === "string" ? params.template.trim() : "";
  const template = raw ? raw.slice(0, 60) : null;
  const plan = await buildSessionPlan(template);
  return <SessionLog plan={plan} />;
}
