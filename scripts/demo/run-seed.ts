// Runs the demo reseed from a terminal (same code the cron runs) and prints
// the real error if it fails:  npx tsx --env-file=.env scripts/demo/run-seed.ts
import { seedDemoTenant } from "../../src/lib/demo/seed";
import { generateDemoWorkoutAnswers } from "../../src/lib/demo/workout-answers";
seedDemoTenant()
  .then(async (r) => { console.log(JSON.stringify(r)); console.log(JSON.stringify(await generateDemoWorkoutAnswers())); process.exit(0); })
  .catch((e) => { console.error("SEED FAILED:", String(e?.message ?? e).split("\n").filter((l: string) => l.trim()).slice(-6).join(" | ").slice(0, 900)); process.exit(1); });
