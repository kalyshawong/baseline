"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { CorrelationResult } from "@/lib/correlation";

interface SerializedExperiment {
  id: string;
  title: string;
  hypothesis: string;
  independentVariable: string;
  dependentVariable: string;
  dependentMetric: string;
  metricSource: string;
  lagDays: number;
  startDate: string;
  endDate: string | null;
  minDays: number;
  status: string;
  createdAt: string;
  updatedAt: string;
  logs: Array<{
    id: string;
    day: string;
    independentValue: boolean;
    intensity: number | null;
    notes: string | null;
    createdAt: string;
  }>;
  tags: Array<{
    id: string;
    tag: string;
    category: string;
    timestamp: string;
  }>;
}

const statusColors: Record<string, string> = {
  draft: "bg-neutral-500/20 text-neutral-400",
  active: "bg-emerald-500/20 text-emerald-400",
  completed: "bg-blue-500/20 text-blue-400",
  analyzed: "bg-purple-500/20 text-purple-400",
};

export function ExperimentDetail({
  experiment,
  treatmentCount,
  controlCount,
}: {
  experiment: SerializedExperiment;
  treatmentCount: number;
  controlCount: number;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [logType, setLogType] = useState<boolean>(true); // true = treatment
  const [notes, setNotes] = useState("");
  const [result, setResult] = useState<CorrelationResult | null>(null);
  const [analyzeError, setAnalyzeError] = useState<string | null>(null);

  const minMet = treatmentCount >= experiment.minDays && controlCount >= experiment.minDays;
  const canAnalyze = treatmentCount >= 3 && controlCount >= 3;

  function logDay() {
    startTransition(async () => {
      const res = await fetch(`/api/experiments/${experiment.id}/logs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          independentValue: logType,
          notes: notes || undefined,
        }),
      });
      if (res.ok) {
        setNotes("");
        router.refresh();
      }
    });
  }

  function analyze() {
    setAnalyzeError(null);
    startTransition(async () => {
      const res = await fetch(`/api/experiments/${experiment.id}/analyze`, {
        method: "POST",
      });
      const data = await res.json();
      if (res.ok) {
        setResult(data);
        router.refresh();
      } else {
        setAnalyzeError(data.error ?? "Analysis failed");
      }
    });
  }

  function endExperiment() {
    startTransition(async () => {
      await fetch(`/api/experiments/${experiment.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "completed", endDate: new Date().toISOString() }),
      });
      router.refresh();
    });
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-xl font-bold">{experiment.title}</h2>
            <p className="mt-1 text-sm text-[var(--color-text-muted)]">
              {experiment.hypothesis}
            </p>
          </div>
          <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${statusColors[experiment.status]}`}>
            {experiment.status}
          </span>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-4 text-xs text-[var(--color-text-muted)] sm:grid-cols-4">
          <div>
            <p className="font-medium text-[var(--color-text)]">IV</p>
            <p>{experiment.independentVariable}</p>
          </div>
          <div>
            <p className="font-medium text-[var(--color-text)]">DV</p>
            <p>{experiment.dependentVariable}</p>
          </div>
          <div>
            <p className="font-medium text-[var(--color-text)]">Metric</p>
            <p>{experiment.dependentMetric}</p>
          </div>
          <div>
            <p className="font-medium text-[var(--color-text)]">Lag</p>
            <p>{experiment.lagDays === 0 ? "Same day" : `+${experiment.lagDays}d`}</p>
          </div>
        </div>
      </div>

      {/* Daily Log */}
      {(experiment.status === "draft" || experiment.status === "active") && (
        <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6">
          <h3 className="mb-4 text-sm font-medium uppercase tracking-wider text-[var(--color-text-muted)]">
            Log Today
          </h3>
          <div className="flex gap-3">
            <button
              onClick={() => setLogType(true)}
              className={`flex-1 rounded-xl border py-3 text-sm font-medium transition-all ${
                logType
                  ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
                  : "border-[var(--color-border)] text-[var(--color-text-muted)]"
              }`}
            >
              Treatment
            </button>
            <button
              onClick={() => setLogType(false)}
              className={`flex-1 rounded-xl border py-3 text-sm font-medium transition-all ${
                !logType
                  ? "border-blue-500/30 bg-blue-500/10 text-blue-400"
                  : "border-[var(--color-border)] text-[var(--color-text-muted)]"
              }`}
            >
              Control
            </button>
          </div>
          <input
            type="text"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Optional notes..."
            className="mt-3 w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2 text-sm placeholder:text-[var(--color-text-muted)]/50"
          />
          <button
            onClick={logDay}
            disabled={isPending}
            className="mt-3 w-full rounded-xl bg-white/10 py-2.5 text-sm font-medium transition-colors hover:bg-white/20 disabled:opacity-50"
          >
            {isPending ? "Logging..." : "Log Day"}
          </button>
        </div>
      )}

      {/* Progress & Actions */}
      <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6">
        <h3 className="mb-4 text-sm font-medium uppercase tracking-wider text-[var(--color-text-muted)]">
          Progress
        </h3>
        <div className="grid grid-cols-2 gap-4 text-center">
          <div>
            <p className="text-2xl font-bold text-emerald-400">{treatmentCount}</p>
            <p className="text-xs text-[var(--color-text-muted)]">Treatment days</p>
          </div>
          <div>
            <p className="text-2xl font-bold text-blue-400">{controlCount}</p>
            <p className="text-xs text-[var(--color-text-muted)]">Control days</p>
          </div>
        </div>
        {!minMet && (
          <p className="mt-3 text-center text-xs text-[var(--color-text-muted)]">
            Need {Math.max(0, experiment.minDays - treatmentCount)} more treatment &{" "}
            {Math.max(0, experiment.minDays - controlCount)} more control days for full analysis
          </p>
        )}
        <div className="mt-4 flex gap-3">
          {canAnalyze && (
            <button
              onClick={analyze}
              disabled={isPending}
              className="flex-1 rounded-xl bg-purple-500/20 py-2.5 text-sm font-medium text-purple-400 transition-colors hover:bg-purple-500/30 disabled:opacity-50"
            >
              {isPending ? "Analyzing..." : "Run Analysis"}
            </button>
          )}
          {experiment.status === "active" && (
            <button
              onClick={endExperiment}
              disabled={isPending}
              className="flex-1 rounded-xl bg-white/10 py-2.5 text-sm font-medium transition-colors hover:bg-white/20 disabled:opacity-50"
            >
              End Experiment
            </button>
          )}
        </div>
      </div>

      {/* Analysis Results */}
      {(result || analyzeError) && (
        <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6">
          <h3 className="mb-4 text-sm font-medium uppercase tracking-wider text-[var(--color-text-muted)]">
            Analysis Results
          </h3>
          {analyzeError ? (
            <p className="text-sm text-red-400">{analyzeError}</p>
          ) : result ? (
            <div>
              <div
                className={`rounded-xl p-4 text-sm ${
                  result.significance === "significant"
                    ? "bg-emerald-500/10 text-emerald-400"
                    : result.significance === "suggestive"
                      ? "bg-yellow-500/10 text-yellow-400"
                      : "bg-neutral-500/10 text-neutral-400"
                }`}
              >
                {result.insight}
              </div>
              <div className="mt-4 grid grid-cols-2 gap-3 text-xs sm:grid-cols-4">
                <div className="rounded-lg bg-[var(--color-surface-2)] p-3 text-center">
                  <p className="font-mono text-lg font-bold">{result.treatmentMean}</p>
                  <p className="text-[var(--color-text-muted)]">Treatment mean</p>
                </div>
                <div className="rounded-lg bg-[var(--color-surface-2)] p-3 text-center">
                  <p className="font-mono text-lg font-bold">{result.controlMean}</p>
                  <p className="text-[var(--color-text-muted)]">Control mean</p>
                </div>
                <div className="rounded-lg bg-[var(--color-surface-2)] p-3 text-center">
                  <p className="font-mono text-lg font-bold">{result.pValue}</p>
                  <p className="text-[var(--color-text-muted)]">p-value</p>
                </div>
                <div className="rounded-lg bg-[var(--color-surface-2)] p-3 text-center">
                  <p className="font-mono text-lg font-bold">{result.cohensD}</p>
                  <p className="text-[var(--color-text-muted)]">Cohen&apos;s d</p>
                </div>
              </div>
              <p className="mt-4 text-xs text-[var(--color-text-muted)] leading-relaxed">
                These are personal observations, not medical advice. Correlations found in
                n=1 experiments have limited statistical power and should be treated as
                hypotheses for further investigation.
              </p>
            </div>
          ) : null}
        </div>
      )}

      {/* Log History */}
      {experiment.logs.length > 0 && (
        <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6">
          <h3 className="mb-4 text-sm font-medium uppercase tracking-wider text-[var(--color-text-muted)]">
            Log History
          </h3>
          <div className="space-y-2">
            {experiment.logs.slice(0, 14).map((log) => (
              <div
                key={log.id}
                className="flex items-center gap-3 rounded-lg bg-[var(--color-surface-2)] px-3 py-2 text-sm"
              >
                <span
                  className={`h-2 w-2 rounded-full ${
                    log.independentValue ? "bg-emerald-400" : "bg-blue-400"
                  }`}
                />
                <span className="font-mono text-xs">
                  {new Date(log.day).toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                  })}
                </span>
                <span className="text-xs text-[var(--color-text-muted)]">
                  {log.independentValue ? "Treatment" : "Control"}
                </span>
                {log.notes && (
                  <span className="ml-auto text-xs text-[var(--color-text-muted)]">
                    {log.notes}
                  </span>
                )}
              </div>
            ))}
            {experiment.logs.length > 14 && (
              <p className="text-center text-xs text-[var(--color-text-muted)]">
                + {experiment.logs.length - 14} more entries
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
