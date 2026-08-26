import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUserId } from "@/lib/current-user";
import { apiError } from "@/lib/utils";
import { evaluateDiagnose, rankCandidates, type SessionQuality } from "@/lib/diagnose/engine";
import { preRegisterAndSchedule, completeRun, type Assignment, type PreReg } from "@/lib/diagnose/runs";
import { CANDIDATE_LIBRARY, type OutcomeMetric } from "@/lib/diagnose/candidates";

/**
 * Diagnose engine API. GET returns the live state for both categories;
 * POST advances it: accept | decline | dismiss | adherence | felt | complete.
 * The engine itself is pure (src/lib/diagnose); this route is its host.
 */

export async function GET() {
  try {
    const [strength, run] = await Promise.all([
      evaluateDiagnose("strength"),
      evaluateDiagnose("run"),
    ]);
    const flows = [strength, run].filter(Boolean);
    const active = flows.filter((f) => f!.closedAt == null || f!.state === "VERDICT");
    const out = [];
    for (const f of active) {
      const runs = await prisma.diagnoseRun.findMany({
        where: { flowId: f!.id },
        orderBy: { createdAt: "desc" },
      });
      out.push(serializeFlow(f!, runs));
    }
    return NextResponse.json({ flows: out });
  } catch (error) {
    const { status, body } = apiError(error);
    return NextResponse.json(body, { status });
  }
}

function serializeFlow(
  f: { id: string; category: string; state: string; triggeredAt: Date; flaggedSessions: string; contextResult: string | null; queue: string | null; currentCandidateId: string | null; closedAs: string | null },
  runs: { id: string; candidateId: string; status: string; preReg: string; assignments: string; feltRatings: string | null; verdict: string | null; startDate: Date }[],
) {
  return {
    id: f.id,
    category: f.category,
    state: f.state,
    triggeredAt: f.triggeredAt.toISOString(),
    flagged: JSON.parse(f.flaggedSessions) as SessionQuality[],
    contextChecks: f.contextResult ? JSON.parse(f.contextResult) : [],
    queue: f.queue ? JSON.parse(f.queue) : [],
    currentCandidateId: f.currentCandidateId,
    closedAs: f.closedAs,
    runs: runs.map((r) => ({
      id: r.id,
      candidateId: r.candidateId,
      candidateLabel: CANDIDATE_LIBRARY.find((c) => c.id === r.candidateId)?.label ?? r.candidateId,
      template: CANDIDATE_LIBRARY.find((c) => c.id === r.candidateId)?.template ?? null,
      status: r.status,
      preReg: JSON.parse(r.preReg) as PreReg,
      assignments: JSON.parse(r.assignments) as Assignment[],
      feltRatings: r.feltRatings ? JSON.parse(r.feltRatings) : [],
      verdict: r.verdict ? JSON.parse(r.verdict) : null,
      startDate: r.startDate.toISOString().split("T")[0],
    })),
  };
}

/** Pull the outcome value for an assignment date automatically — the user
 *  marks "done"; the number comes from the data, not from memory. */
async function fetchOutcomeValue(outcome: OutcomeMetric, dateStr: string): Promise<number | null> {
  const day = new Date(dateStr + "T00:00:00.000Z");
  if (outcome === "volume_load_at_prescribed_rpe") {
    const s = await prisma.workoutSession.findFirst({
      where: { date: day, sessionVolume: { gt: 0 } },
      select: { sessionVolume: true },
    });
    return s?.sessionVolume ?? null;
  }
  // night-anchored outcomes: the night of date D is recorded on wake day D+1
  const wake = new Date(day);
  wake.setUTCDate(wake.getUTCDate() + 1);
  if (outcome === "total_sleep_time") {
    const s = await prisma.dailySleep.findFirst({ where: { day: wake }, select: { totalSleepDuration: true } });
    return s?.totalSleepDuration ?? null;
  }
  if (outcome === "nocturnal_rhr") {
    const s = await prisma.dailySleep.findFirst({ where: { day: wake }, select: { lowestHeartRate: true } });
    return s?.lowestHeartRate ?? null;
  }
  if (outcome === "temp_deviation") {
    const s = await prisma.dailyReadiness.findFirst({ where: { day: wake }, select: { temperatureDeviation: true } });
    return s?.temperatureDeviation ?? null;
  }
  if (outcome === "hrv_vs_7day_baseline") {
    const rows = await prisma.dailySleep.findMany({
      where: { day: { lte: wake }, averageHrv: { not: null } },
      orderBy: { day: "desc" },
      take: 8,
      select: { day: true, averageHrv: true },
    });
    const tonight = rows.find((r) => r.day.getTime() === wake.getTime());
    const prior = rows.filter((r) => r.day.getTime() !== wake.getTime()).slice(0, 7);
    if (!tonight || prior.length < 3) return null;
    return tonight.averageHrv! - prior.reduce((a, b) => a + b.averageHrv!, 0) / prior.length;
  }
  return null;
}

export async function POST(request: NextRequest) {
  try {
    const userId = await getCurrentUserId();
    const body = await request.json();
    const action = String(body.action ?? "");

    if (action === "accept") {
      const { flowId, candidateId } = body;
      const result = await preRegisterAndSchedule(flowId, candidateId);
      if (result.refused) {
        await prisma.diagnoseFlow.update({
          where: { id: flowId },
          data: { state: "REFUSED_UNDERPOWERED" },
        });
      }
      return NextResponse.json(result);
    }

    if (action === "decline") {
      const { flowId, candidateId } = body;
      const def = CANDIDATE_LIBRARY.find((c) => c.id === candidateId);
      const st = await prisma.diagnoseCandidateState.upsert({
        where: { userId_candidateId: { userId, candidateId } },
        create: { userId, candidateId, prior: def?.prior ?? 0.3, status: "declined", declineCount: 1 },
        update: { status: "declined", declineCount: { increment: 1 } },
      });
      // §8: declined twice → context for this user; stop proposing.
      if (st.declineCount >= 2) {
        await prisma.diagnoseCandidateState.update({
          where: { userId_candidateId: { userId, candidateId } },
          data: { status: "context" },
        });
      }
      // advance to next testable candidate
      const flow = await prisma.diagnoseFlow.findFirst({ where: { id: flowId } });
      if (!flow) return NextResponse.json({ error: "flow not found" }, { status: 404 });
      const ranked = await rankCandidates(JSON.parse(flow.flaggedSessions));
      const next = ranked.find((r) => r.testableNow && r.id !== candidateId && r.status !== "declined");
      await prisma.diagnoseFlow.update({
        where: { id: flowId },
        data: next
          ? { state: "PROPOSED", currentCandidateId: next.id, queue: JSON.stringify(ranked) }
          : { state: "EXHAUSTED", closedAt: new Date(), closedAs: "exhausted", queue: JSON.stringify(ranked) },
      });
      return NextResponse.json({ ok: true, next: next?.id ?? null });
    }

    if (action === "dismiss") {
      await prisma.diagnoseFlow.updateMany({
        where: { id: body.flowId },
        data: { state: "CLOSED", closedAt: new Date(), closedAs: "dismissed" },
      });
      return NextResponse.json({ ok: true });
    }

    if (action === "adherence") {
      const { runId, idx, done } = body;
      const run = await prisma.diagnoseRun.findFirst({ where: { id: runId } });
      if (!run) return NextResponse.json({ error: "run not found" }, { status: 404 });
      const assignments: Assignment[] = JSON.parse(run.assignments);
      const a = assignments.find((x) => x.idx === idx);
      if (!a) return NextResponse.json({ error: "assignment not found" }, { status: 404 });
      a.done = Boolean(done);
      if (a.done) {
        const preReg: PreReg = JSON.parse(run.preReg);
        a.value = await fetchOutcomeValue(preReg.outcome, a.date);
        // pre-registered exclusion rule, applied blind to arm
        if (preReg.outcome === "total_sleep_time" && a.value != null && a.value < 4 * 3600) {
          a.excluded = "night <4h (pre-set rule)";
        }
      } else {
        a.value = null;
        a.excluded = null;
      }
      await prisma.diagnoseRun.update({
        where: { id: runId },
        data: { assignments: JSON.stringify(assignments) },
      });
      return NextResponse.json({ ok: true, assignment: a });
    }

    if (action === "felt") {
      const { runId, pairIdx, armA, armB } = body;
      const run = await prisma.diagnoseRun.findFirst({ where: { id: runId } });
      if (!run) return NextResponse.json({ error: "run not found" }, { status: 404 });
      const rows: { pairIdx: number; armA: number; armB: number }[] = run.feltRatings ? JSON.parse(run.feltRatings) : [];
      const existing = rows.find((r) => r.pairIdx === pairIdx);
      if (existing) { existing.armA = armA; existing.armB = armB; }
      else rows.push({ pairIdx, armA, armB });
      await prisma.diagnoseRun.update({ where: { id: runId }, data: { feltRatings: JSON.stringify(rows) } });
      return NextResponse.json({ ok: true });
    }

    if (action === "complete") {
      const verdict = await completeRun(body.runId);
      return NextResponse.json({ verdict });
    }

    return NextResponse.json({ error: "unknown action" }, { status: 400 });
  } catch (error) {
    const { status, body } = apiError(error);
    return NextResponse.json(body, { status });
  }
}
