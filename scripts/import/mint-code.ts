/**
 * Mint an import code for a tester moving from the Expo pilot app.
 *
 * Creates the account if the email is new (with the given password, so they
 * can sign in to the iOS shell afterwards), then prints a code for the
 * pilot app's "Send my data" screen. Codes are reusable — re-sending is
 * idempotent — and revoked by deleting the ImportCode row.
 *
 *   npx tsx --env-file=.env scripts/import/mint-code.ts \
 *     --email mom@example.com --password 'temporary-pass' \
 *     --tz Asia/Hong_Kong --note "Mom"
 *
 *   npx tsx --env-file=.env scripts/import/mint-code.ts --list
 */
import { PrismaClient } from "@prisma/client";
import { hash } from "bcryptjs";
import { randomBytes } from "node:crypto";

const p = new PrismaClient();

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

(async () => {
  if (process.argv.includes("--list")) {
    const codes = await p.importCode.findMany({
      include: { user: { select: { email: true } } },
      orderBy: { createdAt: "asc" },
    });
    for (const c of codes) {
      console.log(`${c.code}  ${c.user.email}  ${c.note ?? ""}  used ${c.useCount}x${c.lastUsedAt ? " last " + c.lastUsedAt.toISOString() : ""}`);
    }
    return;
  }

  const email = arg("email")?.trim().toLowerCase();
  const password = arg("password");
  const tz = arg("tz");
  const note = arg("note");
  if (!email) throw new Error("--email is required");
  if (tz) new Intl.DateTimeFormat("en-US", { timeZone: tz }); // throws on a bad zone

  let user = await p.user.findUnique({ where: { email } });
  if (!user) {
    if (!password || password.length < 8) throw new Error("--password (8+ chars) is required for a new account");
    user = await p.user.create({
      data: { email, passwordHash: await hash(password, 12), timezone: tz ?? null },
    });
    console.log(`created account ${email} (${user.id})`);
  } else {
    if (tz && !user.timezone) {
      await p.user.update({ where: { id: user.id }, data: { timezone: tz } });
      console.log(`set timezone ${tz} on existing account ${email}`);
    } else {
      console.log(`existing account ${email} (${user.id})`);
    }
  }

  const code = `imp-${randomBytes(4).toString("hex")}`;
  await p.importCode.create({ data: { code, userId: user.id, note: note ?? null } });
  console.log(`import code: ${code}`);
})()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => p.$disconnect());
