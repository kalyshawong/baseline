/**
 * Canned coach replies for the public demo tenant. The live coach calls the
 * Anthropic API with the user's full context and tool access; the demo must
 * never spend tokens for anonymous visitors, so it answers from this file
 * and persists nothing. The seeded sample conversation (seed.ts) shows what
 * a real exchange looks like.
 */

const INTRO =
  "The live coach is switched off in this public demo, so I can't answer that for real here.";

const WHAT_IT_DOES =
  "In the full app I read your own data before answering — last night's sleep, HRV against your personal baseline, recent training load, what you ate before a session — and I can pull workouts, meals and signals on demand to explain things like why a run went badly. Answers come with your numbers, not generic advice.";

const POINTER =
  "Open the sample conversation in the sidebar to see a real exchange built from this demo profile's data.";

export function demoCoachReply(message: string): string {
  const m = message.toLowerCase();
  let specific = "";
  if (/(train|workout|lift|run|hard|rest day|recover)/.test(m)) {
    specific =
      "For a training question I'd weigh today's readiness and HRV trend against your load from the last 7 days, then give one call: push, hold, or back off — with the numbers that drove it.";
  } else if (/(sleep|bed|tired|nap)/.test(m)) {
    specific =
      "For a sleep question I'd look at your timing regularity, deep and REM against your own range, and what changed on the nights that went well.";
  } else if (/(eat|food|meal|fuel|stomach|gi|carb|protein)/.test(m)) {
    specific =
      "For a fuelling question I'd look back from each session to what you ate in the hours before it, and which foods line up with your good and bad workouts.";
  } else if (/(experiment|test|does .* work|caffeine|alcohol)/.test(m)) {
    specific =
      "For a does-this-work question I'd help you set up a randomized experiment on yourself: pre-registered outcome, app-assigned days, and an honest verdict on whether the design can even detect the effect.";
  }
  return [INTRO, specific, WHAT_IT_DOES, POINTER].filter(Boolean).join("\n\n");
}
