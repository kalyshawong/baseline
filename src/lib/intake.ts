import { prisma } from "@/lib/db";
import { getCurrentUserId, SOLO_USER_ID } from "@/lib/current-user";
import { DEMO_USER_ID } from "@/lib/demo/constants";
import { gatesFor, normalizeIntake, type DashboardGates, type IntakeState } from "@/lib/intake-config";

export * from "@/lib/intake-config";

/**
 * Server side of the intake: who needs onboarding, and the gates for the
 * current request. Pure types + rules live in intake-config.ts so client
 * components can import them without dragging in prisma / async_hooks.
 */

/* ---------------- per-request access ---------------- */

export interface IntakeStatus {
  userId: string;
  /** Owner + demo never see onboarding; a new account without answers does. */
  needsOnboarding: boolean;
  intake: IntakeState | null;
  gates: DashboardGates;
}

export async function getIntakeStatus(): Promise<IntakeStatus> {
  const userId = await getCurrentUserId();
  const exempt = userId === SOLO_USER_ID || userId === DEMO_USER_ID;
  const row = await prisma.user.findUnique({
    where: { id: userId },
    select: { intake: true, intakeCompletedAt: true, importedExpo: true },
  });
  let intake: IntakeState | null = null;
  if (row?.intake) {
    try {
      intake = normalizeIntake(JSON.parse(row.intake));
    } catch {
      intake = null;
    }
  }
  const completed = !!row?.intakeCompletedAt && !!intake;
  return {
    userId,
    needsOnboarding: !exempt && !completed,
    intake: completed ? intake : null,
    gates: gatesFor(completed ? intake : null),
  };
}

/** Best pre-fill for a person who answered the pilot app's intake already. */
export async function seedIntakeFromImport(userId: string): Promise<IntakeState | null> {
  const row = await prisma.user.findUnique({ where: { id: userId }, select: { importedExpo: true, intake: true } });
  if (row?.intake) {
    try {
      return normalizeIntake(JSON.parse(row.intake));
    } catch {
      /* fall through */
    }
  }
  if (!row?.importedExpo) return null;
  try {
    const imported = JSON.parse(row.importedExpo) as { intake?: unknown };
    return imported.intake ? normalizeIntake(imported.intake) : null;
  } catch {
    return null;
  }
}
