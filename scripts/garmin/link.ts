/**
 * One-time Garmin Connect link for a pilot tester. Run on Kalysha's Mac:
 *
 *   GARMIN_EMAIL='…' GARMIN_PASSWORD='…' \
 *   npx tsx --env-file=.env scripts/garmin/link.ts --user nahalbat@gmail.com [--days 30]
 *
 * Logs in with the library (Garmin SSO → OAuth1 → OAuth2), stores ONLY the
 * resulting tokens on GarminLink for that Baseline account, then runs the
 * first sync. The password is read from the environment of this one
 * process and is never written anywhere. If Garmin asks for an MFA code
 * the login fails here — turn MFA off for the pilot or we add a prompt.
 */
import { PrismaClient } from "@prisma/client";
import { GarminConnect } from "garmin-connect";
import { syncGarminLink } from "../../src/lib/garmin/sync";

const p = new PrismaClient();
const arg = (n: string) => { const i = process.argv.indexOf(`--${n}`); return i >= 0 ? process.argv[i + 1] : undefined; };

(async () => {
  const email = arg("user")?.toLowerCase();
  const days = Number(arg("days") ?? 30);
  const gEmail = process.env.GARMIN_EMAIL;
  const gPass = process.env.GARMIN_PASSWORD;
  if (!email || !gEmail || !gPass) throw new Error("need --user and GARMIN_EMAIL / GARMIN_PASSWORD in the environment");

  const user = await p.user.findUnique({ where: { email } });
  if (!user) throw new Error(`no Baseline account for ${email}`);

  const gc = new GarminConnect({ username: gEmail, password: gPass });
  await gc.login();
  const tokens = gc.exportToken();
  const profile = (await gc.getUserProfile()) as { displayName?: string; fullName?: string };
  console.log(`Garmin login ok — profile ${profile.fullName ?? "?"} (${profile.displayName ?? "no displayName"})`);

  const link = await p.garminLink.upsert({
    where: { userId: user.id },
    create: { userId: user.id, tokens: JSON.stringify(tokens), displayName: profile.displayName ?? null, status: "active" },
    update: { tokens: JSON.stringify(tokens), displayName: profile.displayName ?? null, status: "active", lastError: null },
  });
  console.log(`link ${link.id} saved for ${email}`);

  const r = await syncGarminLink(link.id, days);
  console.log(`synced ${r.days} days; ${r.errors.length} day(s) with endpoint errors`);
  for (const e of r.errors.slice(0, 3)) console.log("  " + e.slice(0, 300));
  const latest = await p.garminDaily.findFirst({ where: { userId: user.id }, orderBy: { day: "desc" } });
  if (latest) {
    const { raw: _raw, ...show } = latest;
    void _raw;
    console.log(JSON.stringify(show, null, 1));
  }
})()
  .catch((e) => { console.error("FAILED:", e instanceof Error ? e.message : e); process.exitCode = 1; })
  .finally(() => p.$disconnect());
