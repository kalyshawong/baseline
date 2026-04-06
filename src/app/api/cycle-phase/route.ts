import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { apiError } from "@/lib/utils";

export async function GET() {
  try {
    const now = new Date();
    const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));

    const phase = await prisma.cyclePhaseLog.findUnique({
      where: { day: today },
    });

    return NextResponse.json({ phase: phase?.phase ?? null });
  } catch (error) {
    const { status, body } = apiError(error);
    return NextResponse.json(body, { status });
  }
}

export async function POST(request: NextRequest) {
  try {
    const { phase } = await request.json();

    const validPhases = ["menstrual", "follicular", "ovulation", "luteal"];
    if (!validPhases.includes(phase)) {
      return NextResponse.json(
        { error: `Invalid phase. Must be one of: ${validPhases.join(", ")}` },
        { status: 400 }
      );
    }

    const now = new Date();
    const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));

    const result = await prisma.cyclePhaseLog.upsert({
      where: { day: today },
      update: { phase },
      create: { day: today, phase, source: "manual" },
    });

    return NextResponse.json({ success: true, phase: result.phase });
  } catch (error) {
    const { status, body } = apiError(error);
    return NextResponse.json(body, { status });
  }
}
