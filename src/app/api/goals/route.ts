import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { apiError } from "@/lib/utils";

export async function GET(request: NextRequest) {
  try {
    const status = new URL(request.url).searchParams.get("status");
    const goals = await prisma.goal.findMany({
      where: status ? { status } : undefined,
      orderBy: [{ status: "asc" }, { deadline: "asc" }],
    });
    return NextResponse.json(goals);
  } catch (error) {
    const { status, body } = apiError(error);
    return NextResponse.json(body, { status });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { title, type, subtype, target, deadline, notes, isPrimary } = body;

    if (!title || !type) {
      return NextResponse.json({ error: "title and type are required" }, { status: 400 });
    }

    const validTypes = ["race", "strength", "physique", "cognitive", "weight", "health", "custom"];
    if (!validTypes.includes(type)) {
      return NextResponse.json(
        { error: `Invalid type. Must be one of: ${validTypes.join(", ")}` },
        { status: 400 }
      );
    }

    if (isPrimary) {
      await prisma.goal.updateMany({
        where: { isPrimary: true },
        data: { isPrimary: false },
      });
    }

    const goal = await prisma.goal.create({
      data: {
        title,
        type,
        subtype: subtype ?? null,
        target: target ?? null,
        deadline: deadline ? new Date(deadline) : null,
        notes: notes ?? null,
        isPrimary: isPrimary ?? false,
      },
    });
    return NextResponse.json(goal, { status: 201 });
  } catch (error) {
    const { status, body } = apiError(error);
    return NextResponse.json(body, { status });
  }
}
