import type { TestedFinding } from "@/lib/tested-findings";

/** Mean paired difference in display units (redesign tested-card headline). */
export function testedDelta(t: TestedFinding): string | null {
  if (t.meanDiff == null) return null;
  const d = t.meanDiff;
  const sign = d >= 0 ? "+" : "−";
  if (t.metric === "totalSleepDuration") return `${sign}${Math.round(Math.abs(d) / 60)} min`;
  if (t.metric === "lowestHeartRate") return `${sign}${Math.abs(Math.round(d * 10) / 10)} bpm`;
  if (t.metric === "hrvVsBaseline") return `${sign}${Math.abs(Math.round(d * 10) / 10)} ms`;
  if (t.metric === "temperatureDeviation") return `${sign}${Math.abs(Math.round(d * 100) / 100)}°C`;
  return `${sign}${Math.abs(Math.round(d * 10) / 10)}`;
}

