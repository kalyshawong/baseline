import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { prisma } from "@/lib/db";
import { apiError, safeJsonParse } from "@/lib/utils";
import { withAnthropicRetry } from "@/lib/anthropic-retry";
import {
  getWorkoutByIdAndSource,
  isValidWorkoutSource,
  type SignalSnapshot,
} from "@/lib/workout-notes";
import {
  getPreWorkoutFuel,
  formatPreWorkoutFuelForPrompt,
} from "@/lib/pre-workout-fuel";

const client = new Anthropic();

/**
 * The analyze endpoint reads a saved WorkoutNote, gathers its frozen
 * signal snapshot + the structured workout (HK or Oura) it references,
 * and asks Claude for a short, specific explanation of what likely
 * caused the experience the user described.
 *
 * Prompt design (informed by Emil's "good defaults beat options" and
 * the user's stated need — "i want context to explain why this
 * happened"):
 *
 *   - Voice: calm, direct coach. No hedging, no "consult a doctor"
 *     boilerplate. The user is an experienced Hyrox athlete; talk to
 *     them like one.
 *   - Structure: 1-2 paragraphs, ~150 words. Lead with the explanation,
 *     finish with one actionable change.
 *   - Specificity: cite numbers (e.g. "HRV CV 29%", "3.5h post-meal").
 *     Vague analysis is useless analysis.
 *   - Honesty about uncertainty: if the data doesn't support a strong
 *     claim, say so. Don't manufacture a clean narrative.
 *   - No therapy-speak. No "great job for logging this." Get to the
 *     point.
 */

const ANALYZE_SYSTEM_PROMPT = `You are an experienced hybrid-athlete coach analyzing a single workout. You speak directly, cite specific numbers, and prioritize useful explanation over reassurance.

Your task: given a workout's structured data, the athlete's narrative notes about how it went, and a snapshot of their relevant physiological signals from that day, explain WHY the workout felt the way it did and recommend ONE concrete change.

Metric definitions you MUST respect — do NOT confuse these:
- "Baseline composite score" is Baseline's proprietary 0-100 daily score (readiness + HRV trend + sleep quality + temp). It is NOT the same as the Oura Readiness score even though both are 0-100.
- "Oura Readiness score" is Oura's own 0-100 score, calculated separately. Cite it as "Readiness" only; never call Baseline composite the "readiness score."
- "HRV (overnight)" is the raw HRV in ms from last night. On its own it's a single point and easy to over-interpret.
- "HRV CV" is the coefficient of variation across the trailing 7 days, as a percentage. This is the load-bearing metric Hyrox/hybrid athletes care about — >10% suggests autonomic instability and overreaching (Flatt & Esco 2016). When you reference HRV in a multi-day sense (overreaching, fatigue, instability), use HRV CV, not the raw overnight value.

Style rules:
- Lead with the most likely explanation. Cite actual numbers (HRV CV %, Baseline composite, Readiness, sleep duration, time-gaps, etc.) — vague analysis is useless analysis.
- 2-3 short paragraphs, roughly 150-250 words total. No headers. Light bulleting is fine for the substitutions.
- If the data is sparse or ambiguous, say "the data here doesn't strongly support a single cause" and offer the 2 most plausible hypotheses instead of inventing one.
- Finish with **one concrete substitution per confounder you named**, not one total. If you named three stacked causes, prescribe three swaps. Each must be a real food + real grams + real timing, OR a real session swap (specific intensity / duration / day), OR a specific recovery protocol. Examples of what good looks like: "swap the steak for 4 oz chicken + 1 cup rice + broccoli at 2.5-3h pre, ~40g carbs <15g fat"; "replace Wednesday's HIIT with 30min Z2 row, reassess HRV CV Friday"; "add 1 toast + 1 tbsp honey + ½ banana to your usual eggs for breakfast, brings you to ~45g pre-workout carbs without changing routine." NEVER write generic directional advice ("eat more carbs," "scale back intensity," "improve recovery") — those are non-answers.
- Anchor substitutions in foods the user actually eats — her log includes eggs, white bread, honey, rice, chicken, salmon, pasta, mac and cheese, oatmilk. Pull from that set rather than inventing generic sports-nutrition templates ("Greek yogurt + granola" doesn't land if she doesn't eat that).
- The athlete is experienced. No safety boilerplate. No "consult a doctor." No "great work logging this." Talk to them like a peer who has the same data.
- Plain prose. No emojis. No markdown bolding.
- If you cite a number, the number must match what was passed to you. Do not invent values.

Reasoning rules (load-bearing — the user has explicitly pushed back on previous answers for breaking these):
- **No single-cause when multiple signals are off.** If HRV CV is elevated AND cycle phase is menstrual AND the pre-workout meal was heavy fat / low carb, all three belong in the answer — name and rank them, don't pick the most narratable one and call it "the" cause. "Stacked confounders" is honest; "you were underfueled" alone is not, when other signals were also red.
- **Use positive controls — enumerate, don't pick one.** Walk EVERY metric you were given and name the ones that came back fine, not just one. Sleep score, sleep duration, readiness, baseline composite, temperature deviation, stress summary all qualify. If sleep was 93 AND temp was at baseline (0.0°C deviation) AND readiness was 88, all three are positive controls — say so. Skipping a metric that came back fine reads as cherry-picking. Negative space sharpens the argument.
- **No willpower / moralizing language.** Never write "needs X, not just willpower," "you need to be more disciplined," or any framing of a physiological outcome as a character flaw. The athlete is serious; she does not need a lecture that nutrition or recovery matters.
- **Cycle-day precision.** If menstrual phase is active, a new cycle has started — use day 1-5 of the new cycle, not "day 33 of [the prior cycle]." If unsure of the exact day, just name the phase.`;

interface AnalyzeBody {
  // (No body fields; just trigger). Reserved for future overrides
  // like "re-analyze with longer context" or "focus on nutrition".
}

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;

    if (!process.env.ANTHROPIC_API_KEY) {
      return NextResponse.json(
        { error: "ANTHROPIC_API_KEY not set — add it to .env" },
        { status: 500 },
      );
    }

    const note = await prisma.workoutNote.findUnique({ where: { id } });
    if (!note) {
      return NextResponse.json(
        { error: "Note not found" },
        { status: 404 },
      );
    }

    if (!isValidWorkoutSource(note.workoutSource)) {
      return NextResponse.json(
        { error: "Note has an invalid workout source — data integrity issue" },
        { status: 500 },
      );
    }

    const workout = await getWorkoutByIdAndSource(
      note.workoutSource,
      note.workoutId,
    );
    if (!workout) {
      return NextResponse.json(
        { error: "Workout has been deleted; can't analyze" },
        { status: 410 },
      );
    }

    // Hydrate the frozen signal snapshot. If somehow missing, the
    // analysis falls back to "no signals available" — the AI handles
    // sparse data gracefully per the prompt.
    const signals = safeJsonParse<SignalSnapshot | null>(
      note.signalSnapshot,
      null,
    );

    // Compose the user-content for Claude. Plain prose, well-labeled,
    // so the model can pattern-match without us pre-tokenizing structure.
    const durationMin = Math.round(workout.durationSeconds / 60);
    const startTime = workout.startedAt.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
    });

    const sleepHours =
      signals?.sleepDurationSec != null
        ? `${Math.floor(signals.sleepDurationSec / 3600)}h${Math.round((signals.sleepDurationSec % 3600) / 60)}m`
        : "n/a";

    // Pre-workout fuel for the 4h window before the workout. This is
    // the missing piece that previously left the analyzer unable to
    // explain GI / energy-driven outcomes — e.g. the May 27 puke
    // session was caused by ½ NY strip + ½ porterhouse 3.6h before,
    // but without nutrition in the prompt the model could only point
    // at HRV / sleep / cycle phase. Helper already handles the
    // breakfast/lunch/dinner band convention for time-unknown entries.
    const fuel = await getPreWorkoutFuel(workout.startedAt, 4);
    const fuelBlock = formatPreWorkoutFuelForPrompt(fuel);

    const userMessage = `Workout (from ${workout.source === "healthkit" ? "Apple Watch" : "Oura"}):
- Name: ${workout.name}
- Started: ${startTime}
- Duration: ${durationMin} min
- Avg HR: ${workout.avgHeartRate ?? "n/a"}${workout.maxHeartRate ? ` (max ${workout.maxHeartRate})` : ""}

My notes on how it went:
${note.narrative}

Signals from that day (frozen at the time I wrote the notes — these are independent numbers, do not conflate):
- HRV (overnight, raw): ${signals?.hrv ?? "n/a"} ms
- HRV CV (7-day coefficient of variation, the overreaching metric): ${signals?.hrvCv != null ? `${signals.hrvCv}%` : "n/a"}
- Sleep: ${sleepHours} (Oura sleep score ${signals?.sleepScore ?? "n/a"})
- Baseline composite score (Baseline-proprietary, 0-100): ${signals?.baselineScore ?? "n/a"}
- Oura Readiness score (Oura's own, 0-100): ${signals?.readinessScore ?? "n/a"}
- Stress summary: ${signals?.stressSummary ?? "n/a"}
- Cycle phase: ${
  signals?.cyclePhase
    ? `${signals.cyclePhase}${signals.cyclePhase === "menstrual" && signals.periodDay != null ? `, day ${signals.periodDay} of period` : ""}`
    : signals?.cyclePhaseStaleDays != null
      ? `unknown — last logged ${signals.cyclePhaseStaleDays} days ago (${signals.cyclePhaseLastLogged ?? "n/a"}). DO NOT treat as current; the user hasn't logged a phase recently and any cycle-day claim from this stale anchor would be invented. Either skip cycle from your analysis, or note "cycle phase data is stale — log current phase for a complete answer."`
      : "n/a"
}
- Temperature deviation: ${signals?.temperatureDeviationC != null ? `${signals.temperatureDeviationC > 0 ? "+" : ""}${signals.temperatureDeviationC.toFixed(2)}°C from baseline${signals.temperatureTrendDeviationC != null ? ` (7-day trend ${signals.temperatureTrendDeviationC > 0 ? "+" : ""}${signals.temperatureTrendDeviationC.toFixed(2)}°C)` : ""}` : "n/a"}. Physiology to respect: luteal runs +0.3-0.5°C above baseline; temperature DROPS sharply at menstrual onset back to or below baseline. If you cite a temperature claim, cite the actual number above — do NOT say "core temp runs higher during menstruation" (inverted physiology) and do NOT invent values not in the data.

${fuelBlock}

(Note on the fuel block: time-unknown entries fall back to the user's meal-band convention — breakfast = before noon, lunch = 12-5pm, dinner = 5pm+. The gap range reflects that uncertainty; cite "X-Yh before" rather than collapsing to a single number when the entry is band-estimated. Macro composition close to a workout often matters more than total calories — flag high-fat or large-red-meat meals within ~4h of high-intensity work.)

Why did this workout go the way it did, and what's one change for next time? Cite the specific numbers above; don't paraphrase them or invent values.`;

    const response = await withAnthropicRetry(
      () =>
        client.messages.create({
          model: "claude-sonnet-4-6",
          max_tokens: 600,
          system: ANALYZE_SYSTEM_PROMPT,
          messages: [{ role: "user", content: userMessage }],
        }),
      { label: "workout-note-analyze" },
    );

    // Extract the text out of Anthropic's response shape. Defensive
    // against future SDK changes — just join all text-typed blocks.
    const analysisText = response.content
      .filter((block): block is Anthropic.TextBlock => block.type === "text")
      .map((block) => block.text)
      .join("\n")
      .trim();

    if (!analysisText) {
      return NextResponse.json(
        { error: "Empty analysis from model — retry?" },
        { status: 502 },
      );
    }

    const updated = await prisma.workoutNote.update({
      where: { id },
      data: { analysis: analysisText },
    });

    return NextResponse.json(updated);
  } catch (error) {
    const { status, body } = apiError(error);
    return NextResponse.json(body, { status });
  }
}
