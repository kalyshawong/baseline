import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { buildCoachContext } from "@/lib/coach-context";
import { apiError } from "@/lib/utils";
import { runCoachTurn } from "@/lib/coach-run";
import { getCurrentUserId, SOLO_USER_ID } from "@/lib/current-user";
import { DEMO_USER_ID } from "@/lib/demo/constants";
import { demoCoachReply } from "@/lib/demo/coach";

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

// Context cache: reuse for 5 minutes. Keyed by USER + focusGoalId — this is a
// module global shared by every request on the instance, and the context
// block is the user's full health picture. Keyed by goal alone (pre
// 2026-09-21) a second account could be served the first account's context.
let cachedContext: { key: string; text: string; expiry: number } | null = null;

async function getCachedContext(focusGoalId?: string | null): Promise<string> {
  const cacheKey = `${await getCurrentUserId()}:${focusGoalId ?? "all"}`;
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

    // Public demo: canned reply, no Anthropic call, nothing persisted. Runs
    // before the key check and the rate limiter so demo traffic can neither
    // spend tokens nor eat real users' rate budget.
    if ((await getCurrentUserId()) === DEMO_USER_ID) {
      return NextResponse.json({
        sessionId: sessionId ?? null,
        message: {
          id: `demo-${Date.now()}`,
          role: "assistant",
          content: demoCoachReply(message),
          createdAt: new Date(),
        },
        demo: true,
      });
    }

    if (!process.env.ANTHROPIC_API_KEY) {
      return NextResponse.json(
        { error: "ANTHROPIC_API_KEY not set — add it to .env" },
        { status: 500 }
      );
    }

    // Rate limits (2026-09-25). Per user — the old single "coach" bucket let
    // one account's burst block everyone. Plus a rolling 24h cap per account,
    // counted from stored messages so it holds across serverless instances:
    // every message is an Anthropic call billed to one key. Owner exempt.
    const coachUserId = await getCurrentUserId();
    if (!checkRateLimit(`coach:${coachUserId}`)) {
      return NextResponse.json(
        { error: "Rate limit exceeded — max 10 messages per minute" },
        { status: 429 }
      );
    }
    if (coachUserId !== SOLO_USER_ID) {
      const dailyLimit = Number(process.env.COACH_DAILY_LIMIT ?? 50);
      const sent = await prisma.chatMessage.count({
        where: { role: "user", createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } },
      });
      if (sent >= dailyLimit) {
        return NextResponse.json(
          { error: `Daily coach limit reached (${dailyLimit} messages in 24 hours). Try again tomorrow.` },
          { status: 429 }
        );
      }
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
        data: { userId: await getCurrentUserId(), title: message.slice(0, 60) },
        include: { messages: true },
      });
    }

    // Save user message
    await prisma.chatMessage.create({
      data: { userId: await getCurrentUserId(), sessionId: session.id, role: "user", content: message },
    });

    // Build context (cached for 5 min to avoid 14+ queries every message)
    const contextBlock = await getCachedContext(focusGoalId);

    // Prior conversation history
    const history = session.messages.map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    }));
    history.push({ role: "user", content: message });

    const turn = await runCoachTurn({ history, contextBlock, focusGoalId, mode });
    if (!turn.ok) {
      return NextResponse.json({ error: turn.reason }, { status: 502 });
    }
    const assistantText = turn.text;

    const assistantMsg = await prisma.chatMessage.create({
      data: { userId: await getCurrentUserId(), sessionId: session.id, role: "assistant", content: assistantText },
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
