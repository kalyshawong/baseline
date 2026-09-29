import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { DEMO_USER_ID } from "@/lib/demo/constants";
import { getIntakeStatus, seedIntakeFromImport, EMPTY_INTAKE } from "@/lib/intake";
import { prisma } from "@/lib/db";
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
  const answered = await seedIntakeFromImport(session.userId);
  // Body basics the profile already knows (weigh-ins, Account) pre-fill the body step.
  const profile = await prisma.userProfile.findUnique({ where: { userId: session.userId } });
  const base = answered ?? (profile ? EMPTY_INTAKE : null);
  const seed = base && profile
    ? {
        ...base,
        unit: base.unit ?? (profile.unit === "kg" ? ("kg" as const) : ("lb" as const)),
        heightCm: base.heightCm ?? profile.heightCm ?? null,
        weightKg: base.weightKg ?? profile.bodyWeightKg ?? null,
        age: base.age ?? profile.age ?? null,
        bmrKcal: base.bmrKcal ?? profile.bmrKcal ?? null,
        phase: base.phase ?? (profile.goal === "gain" || profile.goal === "lose" || profile.goal === "maintain" ? profile.goal : null),
      }
    : base;
  return <OnboardingFlow initial={seed} editing={editing} startAt={editing ? null : status.resumeAt} />;
}
