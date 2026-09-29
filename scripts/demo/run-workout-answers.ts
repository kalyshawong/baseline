// Generates the demo's real coach answers for its recent workouts (the same
// step the daily reseed runs after seeding). Idempotent: skips workouts that
// already have an answer.   npx tsx --env-file=.env scripts/demo/run-workout-answers.ts
import { generateDemoWorkoutAnswers } from "../../src/lib/demo/workout-answers";
generateDemoWorkoutAnswers()
  .then((r) => { console.log(JSON.stringify(r)); process.exit(0); })
  .catch((e) => { console.error("FAILED:", String(e?.message ?? e).slice(0, 900)); process.exit(1); });
