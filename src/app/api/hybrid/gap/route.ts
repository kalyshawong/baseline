import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/utils";
import { answerGap } from "@/lib/hybrid";

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Answer "Nothing logged X–Y. Traveling or a break?" — asked once per gap. */
export async function POST(request: NextRequest) {
  try {
    const { start, end, answer } = (await request.json()) as { start?: string; end?: string; answer?: string };
    if (!start || !end || !DAY_RE.test(start) || !DAY_RE.test(end) || start > end) {
      return NextResponse.json({ error: "start and end (YYYY-MM-DD) required" }, { status: 400 });
    }
    if (answer !== "travel" && answer !== "break") {
      return NextResponse.json({ error: "answer must be travel or break" }, { status: 400 });
    }
    const days = await answerGap(start, end, answer);
    return NextResponse.json({ ok: true, days });
  } catch (error) {
    const { status, body } = apiError(error);
    return NextResponse.json(body, { status });
  }
}
