/**
 * Tester usage report (2026-09-25) — "do people other than Kalysha actually
 * use Baseline?" Counts, per account, the days in the last N days on which
 * the person DID something themselves (logged a tag, meal, set, check-in,
 * soreness, experiment entry, or coach message), separately from days that
 * only had passive device syncs. Read-only; no schema changes.
 *
 *   npx tsx --env-file=.env scripts/usage/report.ts [days=30]
 */
import { PrismaClient } from "@prisma/client";

const p = new PrismaClient();
const DAYS = Number(process.argv[2] ?? 30);
const since = new Date(Date.now() - DAYS * 86400_000);
const day = (d: Date) => d.toISOString().slice(0, 10);

type Row = { userId: string; createdAt: Date };
const q = { where: { createdAt: { gte: since } }, select: { userId: true, createdAt: true } } as const;

(async () => {
  const users = await p.user.findMany({ select: { id: true, email: true, createdAt: true } });
  const active: Row[] = (
    await Promise.all([
      p.activityTag.findMany(q),
      p.nutritionEntry.findMany(q),
      p.workoutSet.findMany(q),
      p.sorenessLog.findMany(q),
      p.experimentLog.findMany(q),
      p.lifeContextLog.findMany(q),
      p.weightLog.findMany(q),
      p.chatMessage.findMany({ ...q, where: { ...q.where, role: "user" } }),
    ])
  ).flat();
  const passive: Row[] = (
    await Promise.all([
      p.healthKitSync.findMany({ where: { syncedAt: { gte: since }, status: "success" }, select: { userId: true, syncedAt: true } })
        .then((r) => r.map((x) => ({ userId: x.userId, createdAt: x.syncedAt }))),
      p.syncLog.findMany(q),
    ])
  ).flat();

  const days = (rows: Row[], uid: string) => new Set(rows.filter((r) => r.userId === uid).map((r) => day(r.createdAt)));
  console.log(`Last ${DAYS} days (UTC days)\n`);
  console.log("account".padEnd(34), "active days", "sync-only days", "last active");
  for (const u of users) {
    if (u.id === "usr_demo") continue;
    const a = days(active, u.id);
    const s = days(passive, u.id);
    const syncOnly = [...s].filter((d) => !a.has(d)).length;
    const last = [...a].sort().pop() ?? "—";
    console.log(u.email.padEnd(34), String(a.size).padStart(11), String(syncOnly).padStart(14), " ", last);
  }
  await p.$disconnect();
})().catch((e) => { console.error(e); process.exit(1); });
