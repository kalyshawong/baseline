"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { experimentTemplates, type ExperimentTemplate } from "@/lib/experiment-templates";

export default function NewExperimentPage() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [mode, setMode] = useState<"templates" | "custom">("templates");
  const [form, setForm] = useState<Partial<ExperimentTemplate>>({});
  const [error, setError] = useState<string | null>(null);

  function selectTemplate(template: ExperimentTemplate) {
    setForm(template);
    setMode("custom"); // switch to form view pre-filled
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!form.title || !form.hypothesis || !form.independentVariable || !form.dependentVariable || !form.dependentMetric || !form.metricSource) {
      setError("All fields are required");
      return;
    }

    startTransition(async () => {
      const res = await fetch("/api/experiments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (res.ok) {
        const exp = await res.json();
        router.push(`/mind/experiments/${exp.id}`);
      } else {
        const data = await res.json();
        setError(data.error ?? "Failed to create experiment");
      }
    });
  }

  return (
    <div>
      {mode === "templates" ? (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-medium uppercase tracking-wider text-[var(--color-text-muted)]">
              Start from a Template
            </h2>
            <button
              onClick={() => setMode("custom")}
              className="text-xs text-[var(--color-text-muted)] underline hover:text-white"
            >
              Or create custom
            </button>
          </div>
          {experimentTemplates.map((t, i) => (
            <button
              key={i}
              onClick={() => selectTemplate(t)}
              className="block w-full rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 text-left transition-colors hover:border-[var(--color-text-muted)]/30"
            >
              <p className="font-medium">{t.title}</p>
              <p className="mt-1 text-xs text-[var(--color-text-muted)]">
                {t.hypothesis}
              </p>
              <div className="mt-2 flex gap-3 text-xs text-[var(--color-text-muted)]">
                <span>IV: {t.independentVariable}</span>
                <span>DV: {t.dependentVariable}</span>
                {t.lagDays > 0 && <span>+{t.lagDays}d lag</span>}
              </div>
            </button>
          ))}
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-medium uppercase tracking-wider text-[var(--color-text-muted)]">
              Create Experiment
            </h2>
            <button
              type="button"
              onClick={() => { setMode("templates"); setForm({}); }}
              className="text-xs text-[var(--color-text-muted)] underline hover:text-white"
            >
              Back to templates
            </button>
          </div>

          {error && (
            <div className="rounded-lg bg-red-500/10 px-3 py-2 text-xs text-red-400">
              {error}
            </div>
          )}

          <div className="space-y-3 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
            <Field
              label="Title"
              value={form.title ?? ""}
              onChange={(v) => setForm({ ...form, title: v })}
              placeholder="e.g. Lo-fi music & deep sleep"
            />
            <Field
              label="Hypothesis"
              value={form.hypothesis ?? ""}
              onChange={(v) => setForm({ ...form, hypothesis: v })}
              placeholder="e.g. Listening to lo-fi before bed increases deep sleep"
            />
            <Field
              label="Independent variable (what you change)"
              value={form.independentVariable ?? ""}
              onChange={(v) => setForm({ ...form, independentVariable: v })}
              placeholder="e.g. Lo-fi music before bed"
            />
            <Field
              label="Dependent variable (what you measure)"
              value={form.dependentVariable ?? ""}
              onChange={(v) => setForm({ ...form, dependentVariable: v })}
              placeholder="e.g. Deep sleep duration"
            />
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs text-[var(--color-text-muted)]">
                  Metric field
                </label>
                <select
                  value={form.dependentMetric ?? ""}
                  onChange={(e) => setForm({ ...form, dependentMetric: e.target.value })}
                  className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2 text-sm"
                >
                  <option value="">Select metric</option>
                  <optgroup label="Sleep">
                    <option value="deepSleepDuration">Deep sleep duration</option>
                    <option value="remSleepDuration">REM sleep duration</option>
                    <option value="totalSleepDuration">Total sleep duration</option>
                    <option value="sleepEfficiency">Sleep efficiency</option>
                    <option value="averageHrv">Average HRV</option>
                    <option value="lowestHeartRate">Lowest heart rate</option>
                  </optgroup>
                  <optgroup label="Readiness">
                    <option value="score">Readiness score</option>
                    <option value="temperatureDeviation">Temperature deviation</option>
                  </optgroup>
                  <optgroup label="Stress">
                    <option value="stressHigh">Stress high (seconds)</option>
                    <option value="recoveryHigh">Recovery high (seconds)</option>
                  </optgroup>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs text-[var(--color-text-muted)]">
                  Source table
                </label>
                <select
                  value={form.metricSource ?? ""}
                  onChange={(e) => setForm({ ...form, metricSource: e.target.value })}
                  className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2 text-sm"
                >
                  <option value="">Select source</option>
                  <option value="DailySleep">DailySleep</option>
                  <option value="DailyReadiness">DailyReadiness</option>
                  <option value="DailyStress">DailyStress</option>
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field
                label="Lag days (0 = same day)"
                value={String(form.lagDays ?? 0)}
                onChange={(v) => setForm({ ...form, lagDays: parseInt(v) || 0 })}
                type="number"
              />
              <Field
                label="Min days per condition"
                value={String(form.minDays ?? 14)}
                onChange={(v) => setForm({ ...form, minDays: parseInt(v) || 14 })}
                type="number"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={isPending}
            className="w-full rounded-xl bg-white/10 py-3 text-sm font-medium transition-colors hover:bg-white/20 disabled:opacity-50"
          >
            {isPending ? "Creating..." : "Create Experiment"}
          </button>
        </form>
      )}
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
}) {
  return (
    <div>
      <label className="mb-1 block text-xs text-[var(--color-text-muted)]">
        {label}
      </label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2 text-sm placeholder:text-[var(--color-text-muted)]/50"
      />
    </div>
  );
}
