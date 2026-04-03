import { prisma } from "./db";
// @ts-expect-error — jstat has no type declarations
import { jStat } from "jstat";

export interface Insight {
  tag: string;
  category: string;
  metric: string;
  metricLabel: string;
  taggedMean: number;
  untaggedMean: number;
  percentDiff: number;
  direction: "higher" | "lower";
  pValue: number;
  significance: "significant" | "suggestive" | "not_significant";
  taggedN: number;
  untaggedN: number;
  recommendation: string;
}

const metricConfigs = [
  { field: "deepSleepDuration", label: "deep sleep", source: "DailySleep", unit: "sec", higherIsBetter: true },
  { field: "averageHrv", label: "HRV", source: "DailySleep", unit: "ms", higherIsBetter: true },
  { field: "sleepEfficiency", label: "sleep efficiency", source: "DailySleep", unit: "%", higherIsBetter: true },
  { field: "score", label: "readiness", source: "DailyReadiness", unit: "", higherIsBetter: true },
] as const;

function welchP(a: number[], b: number[]): number {
  if (a.length < 3 || b.length < 3) return 1;
  const meanA = a.reduce((s, v) => s + v, 0) / a.length;
  const meanB = b.reduce((s, v) => s + v, 0) / b.length;
  const varA = a.reduce((s, v) => s + (v - meanA) ** 2, 0) / (a.length - 1);
  const varB = b.reduce((s, v) => s + (v - meanB) ** 2, 0) / (b.length - 1);
  const se = Math.sqrt(varA / a.length + varB / b.length);
  if (se === 0) return 1;
  const t = (meanA - meanB) / se;
  const num = (varA / a.length + varB / b.length) ** 2;
  const denom = (varA / a.length) ** 2 / (a.length - 1) + (varB / b.length) ** 2 / (b.length - 1);
  const df = num / denom;
  return 2 * (1 - jStat.studentt.cdf(Math.abs(t), df));
}

function generateRecommendation(
  tag: string,
  metricLabel: string,
  direction: "higher" | "lower",
  significance: string,
  higherIsBetter: boolean
): string {
  const isGood = (direction === "higher" && higherIsBetter) || (direction === "lower" && !higherIsBetter);

  if (significance === "significant") {
    if (isGood) {
      return `Keep doing "${tag}" — it shows a strong positive correlation with ${metricLabel}.`;
    }
    return `Consider reducing "${tag}" — it correlates with lower ${metricLabel}.`;
  }
  if (significance === "suggestive") {
    if (isGood) {
      return `"${tag}" shows a promising trend for ${metricLabel}. Keep logging to confirm.`;
    }
    return `"${tag}" may be affecting your ${metricLabel} negatively. Log more data to confirm.`;
  }
  return `No clear relationship between "${tag}" and ${metricLabel} yet. Keep logging.`;
}

export async function generateInsights(): Promise<Insight[]> {
  // Get all tags from the last 90 days grouped by tag name
  const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);

  const allTags = await prisma.activityTag.findMany({
    where: { timestamp: { gte: ninetyDaysAgo } },
    select: { tag: true, category: true, timestamp: true },
  });

  // Group tags by name and collect the dates they were logged
  const tagDays = new Map<string, { category: string; days: Set<string> }>();
  for (const t of allTags) {
    const dayStr = t.timestamp.toISOString().split("T")[0];
    const existing = tagDays.get(t.tag);
    if (existing) {
      existing.days.add(dayStr);
    } else {
      tagDays.set(t.tag, { category: t.category, days: new Set([dayStr]) });
    }
  }

  // Only analyze tags with 10+ instances
  const qualifiedTags = Array.from(tagDays.entries()).filter(
    ([, v]) => v.days.size >= 5
  );

  if (qualifiedTags.length === 0) return [];

  // Fetch biometric data for the period
  const [sleepData, readinessData] = await Promise.all([
    prisma.dailySleep.findMany({
      where: { day: { gte: ninetyDaysAgo } },
    }),
    prisma.dailyReadiness.findMany({
      where: { day: { gte: ninetyDaysAgo } },
    }),
  ]);

  const sleepByDay = new Map(sleepData.map((s) => [s.day.toISOString().split("T")[0], s]));
  const readinessByDay = new Map(readinessData.map((r) => [r.day.toISOString().split("T")[0], r]));

  // All days that have biometric data
  const allBioDays = new Set([...sleepByDay.keys(), ...readinessByDay.keys()]);

  const insights: Insight[] = [];

  for (const [tagName, { category, days: taggedDaySet }] of qualifiedTags) {
    for (const metric of metricConfigs) {
      const taggedValues: number[] = [];
      const untaggedValues: number[] = [];

      for (const day of allBioDays) {
        const isTagged = taggedDaySet.has(day);
        let value: number | null = null;

        if (metric.source === "DailySleep") {
          const row = sleepByDay.get(day);
          if (row) value = (row as Record<string, unknown>)[metric.field] as number | null;
        } else if (metric.source === "DailyReadiness") {
          const row = readinessByDay.get(day);
          if (row) value = (row as Record<string, unknown>)[metric.field] as number | null;
        }

        if (value == null) continue;

        if (isTagged) {
          taggedValues.push(value);
        } else {
          untaggedValues.push(value);
        }
      }

      if (taggedValues.length < 3 || untaggedValues.length < 3) continue;

      const taggedMean = taggedValues.reduce((a, b) => a + b, 0) / taggedValues.length;
      const untaggedMean = untaggedValues.reduce((a, b) => a + b, 0) / untaggedValues.length;
      const pValue = welchP(taggedValues, untaggedValues);

      if (pValue >= 0.15) continue; // Only surface interesting correlations

      const meanDiff = taggedMean - untaggedMean;
      const pctDiff = untaggedMean !== 0 ? Math.abs((meanDiff / untaggedMean) * 100) : 0;
      const direction: "higher" | "lower" = meanDiff > 0 ? "higher" : "lower";
      const significance = pValue < 0.05 ? "significant" as const : pValue < 0.10 ? "suggestive" as const : "not_significant" as const;

      insights.push({
        tag: tagName,
        category,
        metric: metric.field,
        metricLabel: metric.label,
        taggedMean: Math.round(taggedMean * 100) / 100,
        untaggedMean: Math.round(untaggedMean * 100) / 100,
        percentDiff: Math.round(pctDiff * 10) / 10,
        direction,
        pValue: Math.round(pValue * 1000) / 1000,
        significance,
        taggedN: taggedValues.length,
        untaggedN: untaggedValues.length,
        recommendation: generateRecommendation(
          tagName,
          metric.label,
          direction,
          significance,
          metric.higherIsBetter
        ),
      });
    }
  }

  // Sort by significance then p-value
  insights.sort((a, b) => {
    const sigOrder = { significant: 0, suggestive: 1, not_significant: 2 };
    if (sigOrder[a.significance] !== sigOrder[b.significance]) {
      return sigOrder[a.significance] - sigOrder[b.significance];
    }
    return a.pValue - b.pValue;
  });

  return insights;
}
