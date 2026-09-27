import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { DEMO_USER_ID } from "@/lib/demo/constants";
import { getIntakeStatus, seedIntakeFromImport } from "@/lib/intake";
import { OnboardingFlow } from "./onboarding-flow";

export const dynamic = "force-dynamic";

/**
 * First-sign-in questionnaire. Everything after it — which cards exist,
 * which questions the app bothers asking — is derived from these answers
 * (src/lib/intake.ts). Reachable later from /account to change answers.
 */
export default async function OnboardingPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = (await auth()) as { userId?: string } | null;
  if (!session?.userId) redirect("/login");
  if (session.userId === DEMO_USER_ID) redirect("/");
  const params = await searchParams;
  const editing = params.edit === "1";
  const status = await getIntakeStatus();
  if (!status.needsOnboarding && !editing) redirect("/");
  const seed = await seedIntakeFromImport(session.userId);
  return <OnboardingFlow initial={seed} editing={editing} />;
}
