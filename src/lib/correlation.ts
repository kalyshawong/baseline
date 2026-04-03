import { prisma } from "./db";
// @ts-expect-error — jstat has no type declarations
import { jStat } from "jstat";

export interface CorrelationResult {
  treatmentMean: number;
  controlMean: number;
  meanDifference: number;
  percentDifference: number;
  pValue: number;
  cohensD: number;
  confidenceInterval: [number, number];
  significance: "significant" | "suggestive" | "not_significant";
  treatmentN: number;
  controlN: number;
  insight: string;
}

function welchTTest(a: number[], b: number[]): { t: number; df: number; p: number } {
  const meanA = a.reduce((s, v) => s + v, 0) / a.length;
  const meanB = b.reduce((s, v) => s + v, 0) / b.length;
  const varA = a.reduce((s, v) => s + (v - meanA) ** 2, 0) / (a.length - 1);
  const varB = b.reduce((s, v) => s + (v - meanB) ** 2, 0) / (b.length - 1);

  const se = Math.sqrt(varA / a.length + varB / b.length);
  if (se === 0) return { t: 0, df: a.length + b.length - 2, p: 1 };

  const t = (meanA - meanB) / se;

  // Welch-Satterthwaite degrees of freedom
  const num = (varA / a.length + varB / b.length) ** 2;
  const denom =
    (varA / a.length) ** 2 / (a.length - 1) +
    (varB / b.length) ** 2 / (b.length - 1);
  const df = num / denom;

  // Two-tailed p-value from t-distribution
  const p = 2 * (1 - jStat.studentt.cdf(Math.abs(t), df));

  return { t, df, p };
}

function cohensD(a: number[], b: number[]): number {
  const meanA = a.reduce((s, v) => s + v, 0) / a.length;
  const meanB = b.reduce((s, v) => s + v, 0) / b.length;
  const varA = a.reduce((s, v) => s + (v - meanA) ** 2, 0) / (a.length - 1);
  const varB = b.reduce((s, v) => s + (v - meanB) ** 2, 0) / (b.length - 1);
  const pooledSD = Math.sqrt(
    ((a.length - 1) * varA + (b.length - 1) * varB) / (a.length + b.length - 2)
  );
  if (pooledSD === 0) return 0;
  return (meanA - meanB) / pooledSD;
}

function cohensLabel(d: number): string {
  const abs = Math.abs(d);
  if (abs >= 0.8) return "large";
  if (abs >= 0.5) return "medium";
  if (abs >= 0.2) return "small";
  return "negligible";
}

async function fetchMetricValues(
  metricSource: string,
  dependentMetric: string,
  days: Date[]
): Promise<Map<string, number>> {
  const result = new Map<string, number>();
  if (days.length === 0) return result;

  const minDay = new Date(Math.min(...days.map((d) => d.getTime())));
  const maxDay = new Date(Math.max(...days.map((d) => d.getTime())));

  let rows: Array<{ day: Date; [key: string]: unknown }> = [];

  if (metricSource === "DailySleep") {
    rows = await prisma.dailySleep.findMany({
      where: { day: { gte: minDay, lte: maxDay } },
    });
  } else if (metricSource === "DailyReadiness") {
    rows = await prisma.dailyReadiness.findMany({
      where: { day: { gte: minDay, lte: maxDay } },
    });
  } else if (metricSource === "DailyStress") {
    rows = await prisma.dailyStress.findMany({
      where: { day: { gte: minDay, lte: maxDay } },
    });
  }

  for (const row of rows) {
    const dayStr = row.day.toISOString().split("T")[0];
    const val = (row as Record<string, unknown>)[dependentMetric];
    if (typeof val === "number") {
      result.set(dayStr, val);
    }
  }

  return result;
}

export async function analyzeExperiment(experimentId: string): Promise<CorrelationResult | null> {
  const experiment = await prisma.experiment.findUnique({
    where: { id: experimentId },
    include: { logs: { orderBy: { day: "asc" } } },
  });

  if (!experiment) return null;

  const treatmentDays: Date[] = [];
  const controlDays: Date[] = [];

  for (const log of experiment.logs) {
    // Apply lag: shift the DV lookup date forward by lagDays
    const dvDay = new Date(log.day);
    dvDay.setUTCDate(dvDay.getUTCDate() + experiment.lagDays);

    if (log.independentValue) {
      treatmentDays.push(dvDay);
    } else {
      controlDays.push(dvDay);
    }
  }

  if (treatmentDays.length < 3 || controlDays.length < 3) {
    return null; // Not enough data
  }

  const allDays = [...treatmentDays, ...controlDays];
  const metricValues = await fetchMetricValues(
    experiment.metricSource,
    experiment.dependentMetric,
    allDays
  );

  const treatmentValues: number[] = [];
  const controlValues: number[] = [];

  for (const d of treatmentDays) {
    const val = metricValues.get(d.toISOString().split("T")[0]);
    if (val != null) treatmentValues.push(val);
  }
  for (const d of controlDays) {
    const val = metricValues.get(d.toISOString().split("T")[0]);
    if (val != null) controlValues.push(val);
  }

  if (treatmentValues.length < 3 || controlValues.length < 3) {
    return null;
  }

  const { p } = welchTTest(treatmentValues, controlValues);
  const d = cohensD(treatmentValues, controlValues);

  const treatmentMean = treatmentValues.reduce((s, v) => s + v, 0) / treatmentValues.length;
  const controlMean = controlValues.reduce((s, v) => s + v, 0) / controlValues.length;
  const meanDiff = treatmentMean - controlMean;
  const pctDiff = controlMean !== 0 ? (meanDiff / controlMean) * 100 : 0;

  // 95% CI on mean difference
  const varT = treatmentValues.reduce((s, v) => s + (v - treatmentMean) ** 2, 0) / (treatmentValues.length - 1);
  const varC = controlValues.reduce((s, v) => s + (v - controlMean) ** 2, 0) / (controlValues.length - 1);
  const se = Math.sqrt(varT / treatmentValues.length + varC / controlValues.length);
  const ciMargin = 1.96 * se; // approximate 95% CI

  const significance: CorrelationResult["significance"] =
    p < 0.05 ? "significant" : p < 0.10 ? "suggestive" : "not_significant";

  const direction = meanDiff > 0 ? "higher" : "lower";
  const absPct = Math.abs(Math.round(pctDiff));

  let insight: string;
  if (significance === "significant") {
    insight = `${experiment.independentVariable} correlates with ${absPct}% ${direction} ${experiment.dependentVariable} (p=${p.toFixed(2)}, n=${treatmentValues.length} treatment vs ${controlValues.length} control, effect size: ${cohensLabel(d)})`;
  } else if (significance === "suggestive") {
    insight = `${experiment.independentVariable} shows a suggestive trend toward ${absPct}% ${direction} ${experiment.dependentVariable} (p=${p.toFixed(2)}, n=${treatmentValues.length} vs ${controlValues.length}, effect size: ${cohensLabel(d)})`;
  } else {
    insight = `${experiment.independentVariable} shows no significant effect on ${experiment.dependentVariable} (p=${p.toFixed(2)}, n=${treatmentValues.length} vs ${controlValues.length})`;
  }

  return {
    treatmentMean: Math.round(treatmentMean * 100) / 100,
    controlMean: Math.round(controlMean * 100) / 100,
    meanDifference: Math.round(meanDiff * 100) / 100,
    percentDifference: Math.round(pctDiff * 10) / 10,
    pValue: Math.round(p * 1000) / 1000,
    cohensD: Math.round(d * 100) / 100,
    confidenceInterval: [
      Math.round((meanDiff - ciMargin) * 100) / 100,
      Math.round((meanDiff + ciMargin) * 100) / 100,
    ],
    significance,
    treatmentN: treatmentValues.length,
    controlN: controlValues.length,
    insight,
  };
}
