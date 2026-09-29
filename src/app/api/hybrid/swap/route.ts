import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/utils";
import { answerSwap } from "@/lib/hybrid";

/** "Consider a swap?" → yes / no for today. No changes anything else. */
export async function POST(request: NextRequest) {
  try {
    const { answer, kind, swap } = (await request.json()) as { answer?: string; kind?: string; swap?: string };
    if (answer !== "yes" && answer !== "no") return NextResponse.json({ error: "answer must be yes or no" }, { status: 400 });
    await answerSwap(answer, String(kind ?? "").slice(0, 40), String(swap ?? "").slice(0, 120));
    return NextResponse.json({ ok: true });
  } catch (error) {
    const { status, body } = apiError(error);
    return NextResponse.json(body, { status });
  }
}
