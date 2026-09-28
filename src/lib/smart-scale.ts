import { prisma } from "@/lib/db";

/**
 * Does this user weigh in on a smart (bioimpedance) scale?
 *
 * Weight & body-composition UI only renders for scale users. The signal is
 * body-fat % on any WeightLog row: a plain bathroom scale or a weight typed
 * into Apple Health setup produces weight only, while a smart scale syncing
 * through Apple Health always writes body fat alongside it.
 * Queries are auto-scoped to the current user by the tenant-isolation layer.
 */
export async function hasSmartScale(): Promise<boolean> {
  const row = await prisma.weightLog.findFirst({
    where: { bodyFatPct: { not: null, gt: 0 } },
    select: { id: true },
  });
  return row != null;
}
