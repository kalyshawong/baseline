// Exercise the import logic without HTTP.
//   npx tsx --env-file=.env scripts/import/run-local.ts <import-code> <payload.json>
import { readFileSync } from "node:fs";
import { prisma } from "../../src/lib/db";
import { importExpoPayload, validatePayload } from "../../src/lib/import/expo";
(async () => {
  const [code, file] = process.argv.slice(2);
  const ic = await prisma.importCode.findUnique({ where: { code } });
  if (!ic) throw new Error("bad code");
  const payload = validatePayload(JSON.parse(readFileSync(file, "utf8")));
  console.log(JSON.stringify(await importExpoPayload(ic.userId, payload), null, 1));
})().catch((e) => { console.error("FAILED", e); process.exitCode = 1; }).finally(() => prisma.$disconnect());
