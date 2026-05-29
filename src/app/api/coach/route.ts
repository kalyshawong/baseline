import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { prisma } from "@/lib/db";
import { buildCoachContext, COACH_SYSTEM_PROMPT, goalSystemPromptSection } from "@/lib/coach-context";
import { apiError } from "@/lib/utils";
import { withAnthropicRetry } from "@/lib/anthropic-retry";
import { COACH_TOOLS, runCoachTool } from "@/lib/coach-tools";

const client = new Anthropic();

// --- BUG-004 fix: rate limiting + context caching ---

// Simple in-memory rate limiter (10 req/min)
const rateBuckets = new Map<string, number[]>();
const RATE_LIMIT = 10;
const RATE_WINDOW_MS = 60 * 1000;

function checkRateLimit(key: string): boolean {
  const now = Date.now();
  const timestamps = (rateBuckets.get(key) ?? []).filter(
    (t) => now - t < RATE_WINDOW_MS
  );
  if (timestamps.length >= RATE_LIMIT) return false;
  timestamps.push(now);
  rateBuckets.set(key, timestamps);
  return true;
}

// Context cache: reuse for 5 minutes (keyed by focusGoalId)
let cachedContext: { key: string; text: string; expiry: number } | null = null;

async function getCachedContext(focusGoalId?: string | null): Promise<string> {
  const cacheKey = focusGoalId ?? "all";
  if (cachedContext && cachedContext.key === cacheKey && Date.now() < cachedContext.expiry) {
    return cachedContext.text;
  }
  const text = await buildCoachContext(focusGoalId);
  cachedContext = { key: cacheKey, text, expiry: Date.now() + 5 * 60 * 1000 };
  return text;
}

// Bound the Anthropic-bound free-text field. The whole message is sent to
// Claude verbatim, so unbounded length = unbounded token cost. 8 KB covers
// even a long pasted log/journal entry while capping the worst case.
const COACH_MESSAGE_MAX_LEN = 8_000;
const VALID_COACH_MODES = ["today", "open"] as const;

export async function POST(request: NextRequest) {
  try {
    const { sessionId, message, focusGoalId, mode } = await request.json();

    if (!message || typeof message !== "string") {
      return NextResponse.json({ error: "message is required" }, { status: 400 });
    }
    if (message.length > COACH_MESSAGE_MAX_LEN) {
      return NextResponse.json(
        { error: `message must be ≤${COACH_MESSAGE_MAX_LEN} chars` },
        { status: 400 }
      );
    }
    if (sessionId != null && typeof sessionId !== "string") {
      return NextResponse.json({ error: "sessionId must be a string" }, { status: 400 });
    }
    if (focusGoalId != null && typeof focusGoalId !== "string") {
      return NextResponse.json({ error: "focusGoalId must be a string" }, { status: 400 });
    }
    if (mode != null && !VALID_COACH_MODES.includes(mode)) {
      return NextResponse.json(
        { error: `mode must be one of: ${VALID_COACH_MODES.join(", ")}` },
        { status: 400 }
      );
    }

    if (!process.env.ANTHROPIC_API_KEY) {
      return NextResponse.json(
        { error: "ANTHROPIC_API_KEY not set — add it to .env" },
        { status: 500 }
      );
    }

    // Rate limit check
    if (!checkRateLimit("coach")) {
      return NextResponse.json(
        { error: "Rate limit exceeded — max 10 messages per minute" },
        { status: 429 }
      );
    }

    // Create or fetch the session
    let session = sessionId
      ? await prisma.chatSession.findUnique({
          where: { id: sessionId },
          include: { messages: { orderBy: { createdAt: "asc" } } },
        })
      : null;

    if (!session) {
      session = await prisma.chatSession.create({
        data: { title: message.slice(0, 60) },
        include: { messages: true },
      });
    }

    // Save user message
    await prisma.chatMessage.create({
      data: { sessionId: session.id, role: "user", content: message },
    });

    // Build context (cached for 5 min to avoid 14+ queries every message)
    const contextBlock = await getCachedContext(focusGoalId);

    // Get the focus goal for the dynamic system prompt section
    const focusGoal = focusGoalId
      ? await prisma.goal.findUnique({ where: { id: focusGoalId } })
      : await prisma.goal.findFirst({ where: { isPrimary: true, status: "active" } });

    const goalPromptSection = goalSystemPromptSection(focusGoal);

    // Prior conversation history
    const history = session.messages.map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    }));
    history.push({ role: "user", content: message });

    const dailyBriefSection = mode === "today"
      ? `\n\nToday's coaching mode: DAILY BRIEF. The user wants a concise check-in. Structure your response as:
1. Body budget (readiness, sleep, physical capacity)
2. Mind budget (stress recovery, cognitive capacity)
3. Active goals check-in (one line per goal: on track / needs attention / conflict)
4. Today's recommendation (what to prioritize, what to eat, when to sleep)
Keep it under 250 words. Be direct and specific with numbers.`
      : "";

    const systemPrompt = `${COACH_SYSTEM_PROMPT}${goalPromptSection}${dailyBriefSection}\n\n---\n\n${contextBlock}`;

    // --- Tool-use loop ---
    // The coach now has tools (defined in src/lib/coach-tools.ts) it can
    // call to pull food log, workouts, signals, cycle, goals on demand.
    // Loop pattern: send messages → model returns either text (done) or
    // tool_use (run tools, append tool_results, loop). MAX_ITERATIONS
    // bounds runaway tool chains; in practice 2-4 rounds suffice for any
    // "explain why this workout was bad" question.
    const MAX_TOOL_ITERATIONS = 8;
    const messages: Anthropic.MessageParam[] = history.map((m) => ({
      role: m.role,
      content: m.content,
    }));

    let response: Anthropic.Message | null = null;
    let iterations = 0;
    while (iterations < MAX_TOOL_ITERATIONS) {
      response = await withAnthropicRetry(
        () =>
          client.messages.create({
            model: process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-20250514",
            max_tokens: 2048,
            system: systemPrompt,
            tools: COACH_TOOLS,
            messages,
          }),
        { label: `coach-iter-${iterations}` },
      );

      if (response.stop_reason !== "tool_use") break;

      // Append the assistant's response (containing tool_use blocks) to
      // messages, then run each requested tool and append a single user
      // message containing all the tool_results.
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

    if (!response) {
      return NextResponse.json(
        { error: "Coach returned no response." },
        { status: 502 },
      );
    }

    // BUG-C2 fix: never persist a blank assistant message. If Anthropic returns
    // no text content (empty array, tool_use only, or safety-filtered), surface
    // an explicit error instead of silently saving "".
    const assistantText = response.content
      .flatMap((block) => (block.type === "text" ? [block.text] : []))
      .join("")
      .trim();

    if (!assistantText) {
      const reason =
        iterations >= MAX_TOOL_ITERATIONS
          ? `Coach exceeded ${MAX_TOOL_ITERATIONS} tool-use iterations without converging on an answer. Try a more specific question.`
          : "Coach returned an empty response. Try rephrasing your question.";
      return NextResponse.json({ error: reason }, { status: 502 });
    }

    const assistantMsg = await prisma.chatMessage.create({
      data: { sessionId: session.id, role: "assistant", content: assistantText },
    });

    await prisma.chatSession.update({
      where: { id: session.id },
      data: { updatedAt: new Date() },
    });

    return NextResponse.json({
      sessionId: session.id,
      message: {
        id: assistantMsg.id,
        role: "assistant",
        content: assistantText,
        createdAt: assistantMsg.createdAt,
      },
    });
  } catch (error) {
    const { status, body } = apiError(error);
    return NextResponse.json(body, { status });
  }
}

export async function GET() {
  try {
    const sessions = await prisma.chatSession.findMany({
      orderBy: { updatedAt: "desc" },
      include: { _count: { select: { messages: true } } },
    });
    return NextResponse.json(sessions);
  } catch (error) {
    const { status, body } = apiError(error);
    return NextResponse.json(body, { status });
  }
}
