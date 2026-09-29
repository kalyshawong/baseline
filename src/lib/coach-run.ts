import Anthropic from "@anthropic-ai/sdk";
import { prisma } from "@/lib/db";
import { buildCoachContext, COACH_SYSTEM_PROMPT, goalSystemPromptSection } from "@/lib/coach-context";
import { withAnthropicRetry } from "@/lib/anthropic-retry";
import { COACH_TOOLS, runCoachTool } from "@/lib/coach-tools";

/**
 * One coach turn: system prompt + context block + tool-use loop → the
 * assistant's text. Shared by /api/coach and the demo's pre-generated
 * workout answers (src/lib/demo/workout-answers.ts), so both give the same
 * answer for the same question. Reads run as whoever the current tenant is;
 * nothing is persisted here.
 */

const client = new Anthropic();

export const MAX_TOOL_ITERATIONS = 8;

export type CoachTurnResult =
  | { ok: true; text: string }
  | { ok: false; reason: string };

export async function runCoachTurn(opts: {
  history: { role: "user" | "assistant"; content: string }[];
  contextBlock?: string;
  focusGoalId?: string | null;
  mode?: "today" | "open" | null;
}): Promise<CoachTurnResult> {
  const contextBlock = opts.contextBlock ?? (await buildCoachContext(opts.focusGoalId ?? undefined));

  const focusGoal = opts.focusGoalId
    ? await prisma.goal.findUnique({ where: { id: opts.focusGoalId } })
    : await prisma.goal.findFirst({ where: { isPrimary: true, status: "active" } });
  const goalPromptSection = goalSystemPromptSection(focusGoal);

  const dailyBriefSection = opts.mode === "today"
    ? `\n\nToday's coaching mode: DAILY BRIEF. The user wants a concise check-in. Structure your response as:
1. Body budget (readiness, sleep, physical capacity)
2. Mind budget (stress recovery, cognitive capacity)
3. Active goals check-in (one line per goal: on track / needs attention / conflict)
4. Today's recommendation (what to prioritize, what to eat, when to sleep)
Keep it under 250 words. Be direct and specific with numbers.`
    : "";

  const systemPrompt = `${COACH_SYSTEM_PROMPT}${goalPromptSection}${dailyBriefSection}\n\n---\n\n${contextBlock}`;

  // Tool-use loop: send → text (done) or tool_use (run tools, append
  // tool_results, loop). MAX_TOOL_ITERATIONS bounds runaway tool chains.
  const messages: Anthropic.MessageParam[] = opts.history.map((m) => ({
    role: m.role,
    content: m.content,
  }));

  let response: Anthropic.Message | null = null;
  let iterations = 0;
  while (iterations < MAX_TOOL_ITERATIONS) {
    response = await withAnthropicRetry(
      () =>
        client.messages.create({
          model: process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-6",
          max_tokens: 2048,
          system: systemPrompt,
          tools: COACH_TOOLS,
          messages,
        }),
      { label: `coach-iter-${iterations}` },
    );

    if (response.stop_reason !== "tool_use") break;

    messages.push({ role: "assistant", content: response.content });
    const toolUses = response.content.filter(
      (b): b is Anthropic.ToolUseBlock => b.type === "tool_use",
    );
    const toolResults: Anthropic.ToolResultBlockParam[] = await Promise.all(
      toolUses.map(async (tu) => ({
        type: "tool_result" as const,
        tool_use_id: tu.id,
        content: await runCoachTool(tu.name, tu.input),
      })),
    );
    messages.push({ role: "user", content: toolResults });
    iterations++;
  }

  if (!response) return { ok: false, reason: "Coach returned no response." };

  // Never return a blank assistant message (BUG-C2).
  const text = response.content
    .flatMap((block) => (block.type === "text" ? [block.text] : []))
    .join("")
    .trim();
  if (!text) {
    return {
      ok: false,
      reason:
        iterations >= MAX_TOOL_ITERATIONS
          ? `Coach exceeded ${MAX_TOOL_ITERATIONS} tool-use iterations without converging on an answer. Try a more specific question.`
          : "Coach returned an empty response. Try rephrasing your question.",
    };
  }
  return { ok: true, text };
}
