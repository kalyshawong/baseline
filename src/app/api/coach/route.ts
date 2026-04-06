import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { prisma } from "@/lib/db";
import { buildCoachContext, COACH_SYSTEM_PROMPT } from "@/lib/coach-context";
import { apiError } from "@/lib/utils";

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

// Context cache: reuse for 5 minutes
let cachedContext: { text: string; expiry: number } | null = null;

async function getCachedContext(): Promise<string> {
  if (cachedContext && Date.now() < cachedContext.expiry) {
    return cachedContext.text;
  }
  const text = await buildCoachContext();
  cachedContext = { text, expiry: Date.now() + 5 * 60 * 1000 };
  return text;
}

export async function POST(request: NextRequest) {
  try {
    const { sessionId, message } = await request.json();

    if (!message || typeof message !== "string") {
      return NextResponse.json({ error: "message is required" }, { status: 400 });
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
    const contextBlock = await getCachedContext();

    // Prior conversation history
    const history = session.messages.map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    }));
    history.push({ role: "user", content: message });

    const systemPrompt = `${COACH_SYSTEM_PROMPT}\n\n---\n\n${contextBlock}`;

    const response = await client.messages.create({
      model: process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-20250514",
      max_tokens: 2048,
      system: systemPrompt,
      messages: history,
    });

    const assistantText =
      response.content[0].type === "text" ? response.content[0].text : "";

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
