import { prisma } from "./db";
// @ts-expect-error — jstat has no type declarations
import { jStat } from "jstat";

export interface InsightMetric {
  metric: string;
  metricLabel: string;
  taggedMean: number;
  untaggedMean: number;
  percentDiff: number;
  pValue: number;
}

export interface Insight {
  tag: string;
  category: string;
  direction: "higher" | "lower";
  significance: "significant" | "suggestive" | "watching";
  taggedN: number;
  untaggedN: number;
  // Human-readable description of what the comparison's control set was. Lets
  // the card explain "1h 48m vs 1h 26m" without leaving the reader guessing
  // which days are in the second bucket (untagged? sibling tags? everyone?).
  controlLabel: string;
  recommendation: string;
  metrics: InsightMetric[];
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
  metricLabels: string[],
  direction: "higher" | "lower",
  significance: string,
  allHigherIsBetter: boolean[],
): string {
  const metricsStr = metricLabels.join(" and ");
  const isGood = allHigherIsBetter.every((hib) =>
    (direction === "higher" && hib) || (direction === "lower" && !hib)
  );

  if (significance === "significant") {
    if (isGood) {
      return `Keep doing "${tag}" — it shows a strong positive correlation with ${metricsStr}.`;
    }
    return `Consider reducing "${tag}" — it correlates with lower ${metricsStr}.`;
  }
  if (significance === "suggestive") {
    if (isGood) {
      return `"${tag}" shows a promising trend for ${metricsStr}. Keep logging to confirm.`;
    }
    return `"${tag}" may be affecting your ${metricsStr} negatively. Log more data to confirm.`;
  }
  return `Early signal — "${tag}" may relate to ${metricsStr}. Needs more data.`;
}

interface RawFinding {
  tag: string;
  category: string;
  metric: string;
  metricLabel: string;
  taggedMean: number;
  untaggedMean: number;
  percentDiff: number;
  direction: "higher" | "lower";
  pValue: number;
  taggedN: number;
  untaggedN: number;
  higherIsBetter: boolean;
  controlLabel: string;
}

/** Compare two groups across all biometric metrics, push significant findings. */
function compareBuckets(
  tagName: string,
  category: string,
  taggedDays: Set<string>,
  controlDays: Set<string>,
  sleepByDay: Map<string, Record<string, unknown>>,
  readinessByDay: Map<string, Record<string, unknown>>,
  out: RawFinding[],
  controlLabel: string,
) {
  for (const metric of metricConfigs) {
    const taggedValues: number[] = [];
    const controlValues: number[] = [];

    for (const day of taggedDays) {
      let value: number | null = null;
      if (metric.source === "DailySleep") {
        const row = sleepByDay.get(day);
        if (row) value = row[metric.field] as number | null;
      } else {
        const row = readinessByDay.get(day);
        if (row) value = row[metric.field] as number | null;
      }
      if (value != null) taggedValues.push(value);
    }

    for (const day of controlDays) {
      let value: number | null = null;
      if (metric.source === "DailySleep") {
        const row = sleepByDay.get(day);
        if (row) value = row[metric.field] as number | null;
      } else {
        const row = readinessByDay.get(day);
        if (row) value = row[metric.field] as number | null;
      }
      if (value != null) controlValues.push(value);
    }

    if (taggedValues.length < 3 || controlValues.length < 3) continue;

    const taggedMean = taggedValues.reduce((a, b) => a + b, 0) / taggedValues.length;
    const controlMean = controlValues.reduce((a, b) => a + b, 0) / controlValues.length;
    const pValue = welchP(taggedValues, controlValues);

    if (pValue >= 0.10) continue;

    const meanDiff = taggedMean - controlMean;
    const pctDiff = controlMean !== 0 ? Math.abs((meanDiff / controlMean) * 100) : 0;

    if (pctDiff < 5) continue;

    out.push({
      tag: tagName,
      category,
      metric: metric.field,
      metricLabel: metric.label,
      taggedMean: Math.round(taggedMean * 100) / 100,
      untaggedMean: Math.round(controlMean * 100) / 100,
      percentDiff: Math.round(pctDiff * 10) / 10,
      direction: meanDiff > 0 ? "higher" : "lower",
      pValue: Math.round(pValue * 1000) / 1000,
      taggedN: taggedValues.length,
      untaggedN: controlValues.length,
      higherIsBetter: metric.higherIsBetter,
      controlLabel,
    });
  }
}

function percentile(sorted: number[], p: number): number {
  const idx = (p / 100) * (sorted.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

export async function generateInsights(): Promise<Insight[]> {
  const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);

  const [allTags, allLifeLogs, sleepData, readinessData, nutritionLogs, nutritionEntries] = await Promise.all([
    prisma.activityTag.findMany({
      where: { timestamp: { gte: ninetyDaysAgo } },
      select: { tag: true, category: true, timestamp: true },
    }),
    prisma.lifeContextLog.findMany({
      where: { day: { gte: ninetyDaysAgo } },
      select: { day: true, def: { select: { label: true, category: true, groupKey: true } } },
    }),
    prisma.dailySleep.findMany({
      where: { day: { gte: ninetyDaysAgo } },
    }),
    prisma.dailyReadiness.findMany({
      where: { day: { gte: ninetyDaysAgo } },
    }),
    prisma.nutritionLog.findMany({
      where: { day: { gte: ninetyDaysAgo } },
      select: { day: true, calories: true, protein: true, carbs: true, fat: true },
    }),
    prisma.nutritionEntry.findMany({
      where: { createdAt: { gte: ninetyDaysAgo }, timeUnknown: false },
      select: { nutritionLogId: true, eatenAt: true },
    }),
  ]);

  const sleepByDay = new Map(sleepData.map((s) => [s.day.toISOString().split("T")[0], s as unknown as Record<string, unknown>]));
  const readinessByDay = new Map(readinessData.map((r) => [r.day.toISOString().split("T")[0], r as unknown as Record<string, unknown>]));

  const rawFindings: RawFinding[] = [];

  // ─── TAG-BASED ANALYSIS ───────────────────────────────────────────────

  const tagDays = new Map<string, { category: string; days: Set<string> }>();
  // Maps a tag label → its groupKey (when set on the underlying LifeContextDef).
  // Only LifeContextDef-backed tags carry groups; ActivityTag-backed tags are
  // always ungrouped today. If we add groups to ActivityTag later this map
  // expands; the rest of the pipeline doesn't care which source set the group.
  const labelToGroup = new Map<string, string>();
  for (const t of allTags) {
    if (t.category === "nutrition") continue;

    const dayStr = t.timestamp.toISOString().split("T")[0];
    const existing = tagDays.get(t.tag);
    if (existing) {
      existing.days.add(dayStr);
    } else {
      tagDays.set(t.tag, { category: t.category, days: new Set([dayStr]) });
    }
  }
  for (const log of allLifeLogs) {
    if (!log.def) continue;
    const dayStr = log.day.toISOString().split("T")[0];
    const key = `${log.def.label}`;
    const existing = tagDays.get(key);
    if (existing) {
      existing.days.add(dayStr);
    } else {
      tagDays.set(key, { category: `life:${log.def.category}`, days: new Set([dayStr]) });
    }
    if (log.def.groupKey) labelToGroup.set(log.def.label, log.def.groupKey);
  }

  // Invert labelToGroup so we can ask "what other tags share this group?"
  const groupToLabels = new Map<string, Set<string>>();
  for (const [label, grp] of labelToGroup) {
    const set = groupToLabels.get(grp) ?? new Set<string>();
    set.add(label);
    groupToLabels.set(grp, set);
  }

  const allBioDays = new Set([...sleepByDay.keys(), ...readinessByDay.keys()]);

  const qualifiedTags = Array.from(tagDays.entries()).filter(
    ([, v]) => v.days.size >= 5
  );

  for (const [tagName, { category, days: taggedDaySet }] of qualifiedTags) {
    // For grouped tags, the default "everyone-else" control mixes sibling
    // tags into the comparison, which produces mirrored insights (alone
    // higher / shared-bed lower describe the same axis from opposite poles).
    // Strategy:
    //   1) Try: control = bio days with no tag in this group → cleanest
    //      comparison vs "no-context" days.
    //   2) Fallback when (1) has <5 days: control = sibling days only.
    //      This happens when the user has complete coverage on the group
    //      axis (e.g. every sleep day is tagged with one of alone/with-partner/
    //      non-partner). Pairwise-against-siblings is the next-honest move
    //      and still answers "what's the effect of this tag on the axis".
    //   3) Ungrouped tags keep the original "everyone else" control.
    const grp = labelToGroup.get(tagName);
    const siblingDays = new Set<string>();
    if (grp) {
      const siblings = groupToLabels.get(grp);
      if (siblings) {
        for (const sibling of siblings) {
          if (sibling === tagName) continue;
          const sibDayBucket = tagDays.get(sibling);
          if (!sibDayBucket) continue;
          for (const d of sibDayBucket.days) siblingDays.add(d);
        }
      }
    }

    const cleanControl = new Set<string>();
    for (const d of allBioDays) {
      if (taggedDaySet.has(d)) continue;
      if (grp && siblingDays.has(d)) continue;
      cleanControl.add(d);
    }

    let controlDays = cleanControl;
    let controlLabel: string;
    if (!grp) {
      controlLabel = "days without this tag";
    } else if (cleanControl.size < 5 && siblingDays.size >= 5) {
      // Fallback: compare against siblings only. Exclude any days that also
      // carry the tag itself to keep groups disjoint at the day level.
      const fallback = new Set<string>();
      for (const d of siblingDays) {
        if (!taggedDaySet.has(d)) fallback.add(d);
      }
      controlDays = fallback;
      // Build a sibling label like "Shared bed (with partner), Shared bed
      // (non-partner)" so the user can see exactly which days are in the
      // comparison bucket — without revealing how the group itself was named.
      const siblings = groupToLabels.get(grp);
      const siblingNames = siblings
        ? Array.from(siblings).filter((s) => s !== tagName)
        : [];
      controlLabel = siblingNames.length > 0
        ? `days with ${siblingNames.join(" or ")}`
        : `other ${grp} days`;
    } else {
      controlLabel = `days outside the ${grp} group`;
    }

    compareBuckets(tagName, category, taggedDaySet, controlDays, sleepByDay, readinessByDay, rawFindings, controlLabel);
  }

  // Collapse mirrored findings within the same group. Even after the control
  // exclusion above, two siblings can still both produce significant findings
  // on the same metric (e.g. "alone" vs untagged days → higher deep sleep;
  // "with partner" vs untagged days → lower deep sleep). They describe the
  // same axis from opposite poles, so we keep only the strongest per
  // (groupKey, metric) — the one with the smallest p-value.
  if (labelToGroup.size > 0 && rawFindings.length > 0) {
    const ungroupedFindings: RawFinding[] = [];
    const bestPerGroupMetric = new Map<string, RawFinding>();
    for (const f of rawFindings) {
      const tagGroup = labelToGroup.get(f.tag);
      if (!tagGroup) {
        ungroupedFindings.push(f);
        continue;
      }
      const key = `${tagGroup}::${f.metric}`;
      const existing = bestPerGroupMetric.get(key);
      if (!existing || f.pValue < existing.pValue) {
        bestPerGroupMetric.set(key, f);
      }
    }
    rawFindings.length = 0;
    rawFindings.push(...ungroupedFindings, ...bestPerGroupMetric.values());
  }

  // ─── DAILY MACROS (tertile analysis) ──────────────────────────────────

  // Only analyze days where the user actually logged food (calories > 0)
  const loggedDays = nutritionLogs.filter((l) => l.calories > 0);

  if (loggedDays.length >= 9) {
    const macros = [
      { field: "calories" as const, label: "calorie" },
      { field: "protein" as const, label: "protein" },
      { field: "carbs" as const, label: "carb" },
      { field: "fat" as const, label: "fat" },
    ];

    for (const macro of macros) {
      const sorted = loggedDays.map((l) => l[macro.field]).sort((a, b) => a - b);
      const p33 = percentile(sorted, 33);
      const p66 = percentile(sorted, 66);

      const highDays = new Set<string>();
      const lowDays = new Set<string>();
      for (const l of loggedDays) {
        const dayStr = l.day.toISOString().split("T")[0];
        const val = l[macro.field];
        if (val <= p33) lowDays.add(dayStr);
        else if (val >= p66) highDays.add(dayStr);
      }

      if (highDays.size >= 5 && lowDays.size >= 5) {
        compareBuckets(
          `high ${macro.label} days`, "nutrition:macro",
          highDays, lowDays,
          sleepByDay, readinessByDay, rawFindings,
          `low ${macro.label} days`,
        );
        compareBuckets(
          `low ${macro.label} days`, "nutrition:macro",
          lowDays, highDays,
          sleepByDay, readinessByDay, rawFindings,
          `high ${macro.label} days`,
        );
      }
    }
  }

  // ─── EATING WINDOW ────────────────────────────────────────────────────

  // Group entries by their NutritionLog, compute eating window per day
  const logIdToDay = new Map<string, string>();
  for (const l of nutritionLogs) {
    logIdToDay.set(
      // NutritionLog doesn't have id in our select — fetch via the entries' logId
      // Actually we need the id. Let's build the map from day instead.
      l.day.toISOString().split("T")[0],
      l.day.toISOString().split("T")[0],
    );
  }

  // Group entries by day via their nutritionLogId
  const entriesByLogId = new Map<string, Date[]>();
  for (const e of nutritionEntries) {
    const arr = entriesByLogId.get(e.nutritionLogId);
    if (arr) arr.push(e.eatenAt);
    else entriesByLogId.set(e.nutritionLogId, [e.eatenAt]);
  }

  // We need log IDs to day mapping — re-fetch with id included
  // Instead, let's compute eating windows differently: group entries by date
  const entriesByDay = new Map<string, Date[]>();
  for (const e of nutritionEntries) {
    const dayStr = e.eatenAt.toISOString().split("T")[0];
    const arr = entriesByDay.get(dayStr);
    if (arr) arr.push(e.eatenAt);
    else entriesByDay.set(dayStr, [e.eatenAt]);
  }

  const shortWindow = new Set<string>(); // <8h
  const mediumWindow = new Set<string>(); // 8-12h
  const longWindow = new Set<string>(); // 12h+

  for (const [dayStr, times] of entriesByDay) {
    if (times.length < 2) continue;
    times.sort((a, b) => a.getTime() - b.getTime());
    const windowMinutes = (times[times.length - 1].getTime() - times[0].getTime()) / 60000;
    if (windowMinutes < 480) shortWindow.add(dayStr);
    else if (windowMinutes < 720) mediumWindow.add(dayStr);
    else longWindow.add(dayStr);
  }

  // Compare short vs long eating windows
  if (shortWindow.size >= 5 && longWindow.size >= 5) {
    compareBuckets(
      "short eating window (<8h)", "nutrition:timing",
      shortWindow, longWindow,
      sleepByDay, readinessByDay, rawFindings,
      "long eating-window days (12h+)",
    );
    compareBuckets(
      "long eating window (12h+)", "nutrition:timing",
      longWindow, shortWindow,
      sleepByDay, readinessByDay, rawFindings,
      "short eating-window days (<8h)",
    );
  }
  // Compare short vs medium
  if (shortWindow.size >= 5 && mediumWindow.size >= 5) {
    compareBuckets(
      "short eating window (<8h)", "nutrition:timing",
      shortWindow, mediumWindow,
      sleepByDay, readinessByDay, rawFindings,
      "medium eating-window days (8–12h)",
    );
  }
  // Compare medium vs long
  if (mediumWindow.size >= 5 && longWindow.size >= 5) {
    compareBuckets(
      "long eating window (12h+)", "nutrition:timing",
      longWindow, mediumWindow,
      sleepByDay, readinessByDay, rawFindings,
      "medium eating-window days (8–12h)",
    );
  }

  // ─── GROUP & SORT ─────────────────────────────────────────────────────

  const groupKey = (f: RawFinding) => `${f.tag}::${f.direction}`;
  const groups = new Map<string, RawFinding[]>();
  for (const f of rawFindings) {
    const key = groupKey(f);
    const arr = groups.get(key);
    if (arr) {
      // Deduplicate: if this tag+direction+metric already exists, keep the
      // one with the lower p-value (can happen when eating window comparisons
      // produce the same tag from multiple bucket pairs).
      const existing = arr.find((e) => e.metric === f.metric);
      if (existing) {
        if (f.pValue < existing.pValue) {
          arr[arr.indexOf(existing)] = f;
        }
      } else {
        arr.push(f);
      }
    } else {
      groups.set(key, [f]);
    }
  }

  const insights: Insight[] = [];

  for (const findings of groups.values()) {
    const best = findings.reduce((a, b) => (a.pValue < b.pValue ? a : b));
    const significance = best.pValue < 0.01
      ? "significant" as const
      : best.pValue < 0.05
        ? "suggestive" as const
        : "watching" as const;

    insights.push({
      tag: best.tag,
      category: best.category,
      direction: best.direction,
      significance,
      taggedN: best.taggedN,
      untaggedN: best.untaggedN,
      controlLabel: best.controlLabel,
      recommendation: generateRecommendation(
        best.tag,
        findings.map((f) => f.metricLabel),
        best.direction,
        significance,
        findings.map((f) => f.higherIsBetter),
      ),
      metrics: findings.map((f) => ({
        metric: f.metric,
        metricLabel: f.metricLabel,
        taggedMean: f.taggedMean,
        untaggedMean: f.untaggedMean,
        percentDiff: f.percentDiff,
        pValue: f.pValue,
      })),
    });
  }

  insights.sort((a, b) => {
    const sigOrder = { significant: 0, suggestive: 1, watching: 2 };
    if (sigOrder[a.significance] !== sigOrder[b.significance]) {
      return sigOrder[a.significance] - sigOrder[b.significance];
    }
    const aP = Math.min(...a.metrics.map((m) => m.pValue));
    const bP = Math.min(...b.metrics.map((m) => m.pValue));
    return aP - bP;
  });

  // Cap watching-tier cards at 5 to avoid a wall of marginal findings
  let watchingCount = 0;
  return insights.filter((i) => {
    if (i.significance !== "watching") return true;
    watchingCount++;
    return watchingCount <= 5;
  });
}
