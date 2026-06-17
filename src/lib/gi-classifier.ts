import Anthropic from "@anthropic-ai/sdk";
import { withAnthropicRetry } from "./anthropic-retry";
import { safeJsonParse } from "./utils";

/**
 * Narrative -> GI-outcome classifier.
 *
 * Background: WorkoutNote stores the athlete's experience as free-text
 * `narrative` only. There is no structured GI field, so the meal->GI
 * backward analyzer (see docs/meal-gi-analyzer-spec.md) has no outcome
 * variable to work with. This module turns the prose into a labeled
 * `GiOutcome` so the analyzer can build its 2x2 tables.
 *
 * Two-stage design:
 *   1. Cheap keyword pre-filter rules out narratives with zero GI/
 *      digestive language -> "none" without an API call. Pure cost/
 *      latency optimization; it can ONLY emit "none", never a positive
 *      label, so it cannot manufacture a GI event.
 *   2. Anything with a possible GI signal goes to the LLM for a graded
 *      classification with an evidence span and a confidence score.
 *
 * Honesty contract (no-invented-data): the model returns confidence +
 * the quoted evidence. Below CONFIDENCE_REVIEW_FLOOR we DO NOT silently
 * write a positive label — we mark `needsReview` so a human confirms.
 * An unsupported "vomited" label is worse than an honest "unsure".
 */

export type GiOutcome = "none" | "mild" | "moderate" | "vomited";

export interface GiClassification {
  outcome: GiOutcome;
  /** 0..1 model confidence in the label. */
  confidence: number;
  /** Quoted span from the narrative that justifies a non-none label; "" for none. */
  evidence: string;
  /** True when confidence is low enough that a positive label needs human confirmation. */
  needsReview: boolean;
  /** How the label was produced — useful for auditing the backfill. */
  method: "keyword-skip" | "llm";
}

/**
 * Broad recall-first vocabulary. A hit only means "send to the LLM",
 * so false positives here are cheap (one extra call). Keep it generous;
 * the LLM does the real disambiguation. Lowercased, substring-matched.
 */
const GI_HINTS = [
  "vomit", "threw up", "throw up", "throwing up", "puke", "puked",
  "dry heave", "dry-heave", "heave",
  "nausea", "nauseous", "nauseated", "queasy",
  "sick to my stomach", "stomach", "gut", "guts", "belly",
  "cramp", "cramping", "bloat", "bloated", "gassy",
  "reflux", "heartburn", "indigestion", "burp", "burped",
  "side stitch", "stitch",
  "couldn't keep", "couldnt keep", "bring it back up", "came back up",
  "had to stop", "had to slow", "felt sick", "felt ill",
];

const CONFIDENCE_REVIEW_FLOOR = 0.6;

const SYSTEM_PROMPT = `You label a single workout's free-text narrative for gastrointestinal (GI) / digestive distress that occurred BEFORE or DURING the session. You are precise and you do not over-read.

Return ONLY a JSON object, no prose, with this exact shape:
{"outcome": "none|mild|moderate|vomited", "confidence": 0.0-1.0, "evidence": "<shortest quoted span from the narrative that supports the label, or empty string>"}

Label definitions:
- "vomited": the athlete actually threw up, dry-heaved, or could not keep food/drink down around the session.
- "moderate": clear GI distress that impaired the session — e.g. cramps that forced a slow-down or brief stop, strong nausea, urgent gut issues — but no vomiting.
- "mild": noticeable but trained-through — queasy, bloated, a stitch, mild stomach discomfort that did not change the workout.
- "none": no GI/digestive distress mentioned. Soreness, fatigue, bad pacing, low energy, joint pain, cardio difficulty, or feeling "off" for non-digestive reasons are NOT GI events.

Rules:
- Only count GI symptoms tied to this workout window. Ignore mentions of past sessions or unrelated illness days.
- Do NOT infer GI distress from food descriptions alone. "Ate steak 1h before" is not an outcome; "ate steak then felt sick" is.
- "had to stop" only counts as moderate/vomited if the stop was digestive. If they stopped from leg fatigue or being winded, that's "none".
- evidence must be a verbatim substring of the narrative. If outcome is "none", evidence is "".
- Be conservative: if the symptom is ambiguous between two levels, pick the lower one and lower your confidence.`;

const client = new Anthropic();

function keywordHasGiHint(narrative: string): boolean {
  const lower = narrative.toLowerCase();
  return GI_HINTS.some((h) => lower.includes(h));
}

interface RawLabel {
  outcome: GiOutcome;
  confidence: number;
  evidence: string;
}

const VALID: ReadonlySet<string> = new Set(["none", "mild", "moderate", "vomited"]);

/**
 * Classify one narrative.
 *
 * @param narrative  the WorkoutNote.narrative text
 * @param opts.forceLlm  skip the keyword pre-filter and always ask the
 *   LLM. Use when recall matters more than cost (e.g. a careful re-pass
 *   over notes the pre-filter marked "none").
 */
export async function classifyNarrative(
  narrative: string,
  opts: { forceLlm?: boolean } = {},
): Promise<GiClassification> {
  const text = (narrative ?? "").trim();

  // Empty narrative -> nothing to label.
  if (!text) {
    return { outcome: "none", confidence: 1, evidence: "", needsReview: false, method: "keyword-skip" };
  }

  // Stage 1: cheap negative skip.
  if (!opts.forceLlm && !keywordHasGiHint(text)) {
    return { outcome: "none", confidence: 0.9, evidence: "", needsReview: false, method: "keyword-skip" };
  }

  // Stage 2: LLM grading.
  const response = await withAnthropicRetry(
    () =>
      client.messages.create({
        model: "claude-sonnet-4-6",
        max_tokens: 200,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: `Narrative:\n"""${text}"""` }],
      }),
    { label: "gi-classifier" },
  );

  const raw = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("")
    .trim();

  // Strip code fences if the model wrapped the JSON.
  const json = raw.replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  const parsed = safeJsonParse<RawLabel | null>(json, null);

  if (!parsed || !VALID.has(parsed.outcome)) {
    // Could not get a usable label -> default to none, flag for review.
    console.warn(`[gi-classifier] unparseable label for narrative: ${text.slice(0, 80)}`);
    return { outcome: "none", confidence: 0, evidence: "", needsReview: true, method: "llm" };
  }

  const confidence = Math.max(0, Math.min(1, Number(parsed.confidence) || 0));
  const isPositive = parsed.outcome !== "none";

  return {
    outcome: parsed.outcome,
    confidence,
    evidence: typeof parsed.evidence === "string" ? parsed.evidence : "",
    // Only positive labels below the floor need human eyes; a low-confidence
    // "none" is the safe default and doesn't block anything.
    needsReview: isPositive && confidence < CONFIDENCE_REVIEW_FLOOR,
    method: "llm",
  };
}
