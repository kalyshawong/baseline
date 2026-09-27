import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/utils";
import { queueLiftExperiment } from "@/lib/strength/experiments";
import { LIFT_OPTIONS, type LiftDesign } from "@/lib/strength/experiments-config";

/** POST — queue a week-block lifting experiment (strength mode, screen 6). */
export async function POST(request: NextRequest) {
  try {
    const b = (await request.json()) as Partial<LiftDesign>;
    const errors: string[] = [];
    if (typeof b.variable !== "string") errors.push("variable required");
    if (b.outcome !== "vol" && b.outcome !== "e1") errors.push("outcome must be vol or e1");
    if (![7, 8, 9].includes(Number(b.rpe))) errors.push("rpe must be 7, 8 or 9");
    if (!LIFT_OPTIONS.includes(b.lift as never)) errors.push("lift must be one of " + LIFT_OPTIONS.join(", "));
    if (![1, 2, 4].includes(Number(b.blockWeeks))) errors.push("blockWeeks must be 1, 2 or 4");
    if (![4, 6, 8].includes(Number(b.blocks))) errors.push("blocks must be 4, 6 or 8");
    if (errors.length) return NextResponse.json({ error: errors.join("; ") }, { status: 400 });
    const r = await queueLiftExperiment({
      variable: b.variable as string,
      outcome: b.outcome as "vol" | "e1",
      rpe: Number(b.rpe) as 7 | 8 | 9,
      lift: b.lift as LiftDesign["lift"],
      blockWeeks: Number(b.blockWeeks),
      blocks: Number(b.blocks) as 4 | 6 | 8,
    });
    if ("error" in r) return NextResponse.json({ error: r.error }, { status: 422 });
    return NextResponse.json(r, { status: 201 });
  } catch (error) {
    const { status, body } = apiError(error);
    return NextResponse.json(body, { status });
  }
}
