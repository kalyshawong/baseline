import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { prisma } from "@/lib/db";
import { buildCoachContext, COACH_SYSTEM_PROMPT } from "@/lib/coach-context";

const client = new Anthropic();

export async function POST(request: NextRequest) {
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

  // Create or fetch the session
  let session = sessionId
    ? await prisma.chatSession.findUnique({
        where: { id: sessionId },
        include: { messages: { orderBy: { createdAt: "asc" } } },
      })
    : null;

  if (!session) {
    session = await prisma.chatSession.create({
      data: {
        title: message.slice(0, 60),
      },
      include: { messages: true },
    });
  }

  // Save user message
  await prisma.chatMessage.create({
    data: {
      sessionId: session.id,
      role: "user",
      content: message,
    },
  });

  // Build fresh context (user state as of right now)
  const contextBlock = await buildCoachContext();

  // Prior conversation history for this session
  const history = session.messages.map((m) => ({
    role: m.role as "user" | "assistant",
    content: m.content,
  }));

  // Append the new user message
  history.push({ role: "user", content: message });

  // The system prompt includes the core principles + research + current context
  const systemPrompt = `${COACH_SYSTEM_PROMPT}\n\n---\n\n${contextBlock}`;

  try {
    const response = await client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 2048,
      system: systemPrompt,
      messages: history,
    });

    const assistantText =
      response.content[0].type === "text" ? response.content[0].text : "";

    // Save assistant message
    const assistantMsg = await prisma.chatMessage.create({
      data: {
        sessionId: session.id,
        role: "assistant",
        content: assistantText,
      },
    });

    // Update session timestamp
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
    console.error("Coach API error:", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Coach request failed",
      },
      { status: 500 }
    );
  }
}

export async function GET() {
  const sessions = await prisma.chatSession.findMany({
    orderBy: { updatedAt: "desc" },
    include: { _count: { select: { messages: true } } },
  });
  return NextResponse.json(sessions);
}
