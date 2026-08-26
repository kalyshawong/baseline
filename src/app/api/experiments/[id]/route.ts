import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { apiError } from "@/lib/utils";
import { analyzeRigorousExperiment } from "@/lib/experiment-rigor";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const experiment = await prisma.experiment.findUnique({
      where: { id },
      include: {
        logs: { orderBy: { day: "desc" } },
        tags: { orderBy: { timestamp: "desc" }, take: 20 },
      },
    });

    if (!experiment) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    return NextResponse.json(experiment);
  } catch (error) {
    const { status, body } = apiError(error);
    return NextResponse.json(body, { status });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();

    const existing = await prisma.experiment.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const rigorous = existing.assignments != null;

    // ── Rigorous-mode actions ──
    if (rigorous && body.adherence) {
      const assignments = JSON.parse(existing.assignments!) as { idx: number; done: boolean; value: number | null; excluded: string | null }[];
      const a = assignments.find((x) => x.idx === body.adherence.idx);
      if (!a) return NextResponse.json({ error: "assignment not found" }, { status: 404 });
      a.done = Boolean(body.adherence.done);
      if (!a.done) { a.value = null; a.excluded = null; }
      const experiment = await prisma.experiment.update({
        where: { id },
        data: {
          assignments: JSON.stringify(assignments),
          // first adherence mark flips scheduled → active
          ...(existing.status === "scheduled" && a.done ? { status: "active" } : {}),
        },
      });
      return NextResponse.json(experiment);
    }
    if (rigorous && body.felt) {
      const rows: { pairIdx: number; armA: number; armB: number }[] = existing.feltRatings ? JSON.parse(existing.feltRatings) : [];
      const r = rows.find((x) => x.pairIdx === body.felt.pairIdx);
      if (r) { r.armA = body.felt.armA; r.armB = body.felt.armB; }
      else rows.push(body.felt);
      const experiment = await prisma.experiment.update({
        where: { id },
        data: { feltRatings: JSON.stringify(rows) },
      });
      return NextResponse.json(experiment);
    }
    if (rigorous && body.complete) {
      const verdict = await analyzeRigorousExperiment(id);
      return NextResponse.json({ verdict });
    }

    const allowedFields = ["title", "hypothesis", "status", "endDate"] as const;
    const data: Record<string, unknown> = {};
    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        data[field] = field === "endDate" && body[field] ? new Date(body[field]) : body[field];
      }
    }

    // [GUARD] Rigorous experiments are app-scheduled: manual status flips to
    // "active"/"completed" (the old Begin button = regression-to-the-mean
    // trap) are refused. Title/hypothesis edits stay allowed.
    if (rigorous && typeof data.status === "string" && ["active", "completed", "analyzed"].includes(data.status)) {
      return NextResponse.json(
        { error: "This experiment is app-scheduled — it starts on its own start date and completes via its schedule. (Starting when you feel like it is the regression-to-the-mean trap.)" },
        { status: 400 },
      );
    }

    const experiment = await prisma.experiment.update({
      where: { id },
      data,
    });

    return NextResponse.json(experiment);
  } catch (error) {
    const { status, body } = apiError(error);
    return NextResponse.json(body, { status });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    await prisma.experiment.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    const { status, body } = apiError(error);
    return NextResponse.json(body, { status });
  }
}
