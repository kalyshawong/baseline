/**
 * Tester usage report — logged days per account.
 *
 * A "logged day" is a day that HAS a manual log, dated by the day the log is
 * about (meal eaten-at, tag timestamp, workout date, soreness/weight/
 * experiment/life-context day), not the day it was typed in. Kalysha often
 * backlogs several days in one sitting; counting by entry time would collapse
 * those into one day. Passive device syncs and app opens are not counted.
 *
 * Also prints how many of those logs were backfilled (entered on a later day
 * than the day they're about).
 *
 *   npx tsx --env-file=.env scripts/usage/report.ts [days=30]
 */
import { PrismaClient } from "@prisma/client";

const p = new PrismaClient();
const DAYS = Number(process.argv[2] ?? 30);
const since = new Date(Date.now() - DAYS * 86400_000);

type Log = { userId: string; at: Date; createdAt: Date; calendarDay: boolean };

(async () => {
  const users = await p.user.findMany({ select: { id: true, email: true, timezone: true } });
  const sel = { userId: true, createdAt: true } as const;

  const logs: Log[] = [
    ...(await p.activityTag.findMany({ where: { timestamp: { gte: since } }, select: { ...sel, timestamp: true } }))
      .map((r) => ({ userId: r.userId, at: r.timestamp, createdAt: r.createdAt, calendarDay: false })),
    ...(await p.nutritionEntry.findMany({ where: { eatenAt: { gte: since } }, select: { ...sel, eatenAt: true } }))
      .map((r) => ({ userId: r.userId, at: r.eatenAt, createdAt: r.createdAt, calendarDay: false })),
    ...(await p.workoutSession.findMany({ where: { date: { gte: since } }, select: { ...sel, date: true } }))
      .map((r) => ({ userId: r.userId, at: r.date, createdAt: r.createdAt, calendarDay: false })),
    ...(await Promise.all([
      p.sorenessLog.findMany({ where: { day: { gte: since } }, select: { ...sel, day: true } }),
      p.experimentLog.findMany({ where: { day: { gte: since } }, select: { ...sel, day: true } }),
      p.lifeContextLog.findMany({ where: { day: { gte: since } }, select: { ...sel, day: true } }),
      p.weightLog.findMany({ where: { day: { gte: since } }, select: { ...sel, day: true } }),
    ])).flat().map((r) => ({ userId: r.userId, at: r.day, createdAt: r.createdAt, calendarDay: true })),
  ];

  console.log(`Last ${DAYS} days — days with a manual log, by the day the log is about\n`);
  console.log("account".padEnd(34), "logged days", " backfilled logs", " last logged day");
  for (const u of users) {
    if (u.id === "usr_demo") continue;
    const tz = u.timezone ?? "America/New_York";
    const local = (d: Date) => d.toLocaleDateString("en-CA", { timeZone: tz });
    // `day` columns are calendar dates stored at UTC midnight — read them as UTC.
    const dayOf = (l: Log) => (l.calendarDay ? l.at.toISOString().slice(0, 10) : local(l.at));
    const mine = logs.filter((l) => l.userId === u.id);
    const days = new Set(mine.map(dayOf));
    const backfilled = mine.filter((l) => local(l.createdAt) > dayOf(l)).length;
    const last = [...days].sort().pop() ?? "—";
    console.log(u.email.padEnd(34), String(days.size).padStart(11), String(backfilled).padStart(16), " ", last);
  }
  await p.$disconnect();
})().catch((e) => { console.error(e); process.exit(1); });
