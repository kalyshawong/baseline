"use server";

import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { DEMO_USER_ID } from "@/lib/demo/constants";
import { normalizeIntake } from "@/lib/intake";

/** Saves the questionnaire and marks it complete. Demo can't. */
export async function saveIntakeAction(raw: unknown): Promise<{ ok: true } | { ok: false; error: string }> {
  const session = (await auth()) as { userId?: string } | null;
  if (!session?.userId) return { ok: false, error: "Sign in first" };
  if (session.userId === DEMO_USER_ID) return { ok: false, error: "The demo can't be changed" };
  const intake = normalizeIntake(raw);
  if (!intake.goals.length || !intake.devices.length) return { ok: false, error: "Pick at least one goal and one device" };
  await prisma.user.update({
    where: { id: session.userId },
    data: {
      intake: JSON.stringify(intake),
      intakeCompletedAt: new Date(),
      baselineStartedAt: (await prisma.user.findUnique({ where: { id: session.userId }, select: { baselineStartedAt: true } }))?.baselineStartedAt ?? new Date(),
    },
  });
  return { ok: true };
}

export async function finishOnboarding(): Promise<never> {
  redirect("/");
}
