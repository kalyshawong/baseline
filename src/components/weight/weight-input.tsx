"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { kgToLb, lbToKg } from "@/lib/tdee";

export function WeightInput({
  currentUnit,
  latestWeightKg,
}: {
  currentUnit: "lb" | "kg";
  latestWeightKg: number | null;
}) {
  const router = useRouter();
  const [unit, setUnit] = useState<"lb" | "kg">(currentUnit);
  const [value, setValue] = useState<string>("");
  const [bodyFat, setBodyFat] = useState<string>("");
  const [muscleMass, setMuscleMass] = useState<string>("");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const num = parseFloat(value);
    if (!num || num <= 0) {
      setError("Enter a valid weight");
      return;
    }
    setError(null);

    const weightKg = unit === "lb" ? lbToKg(num) : num;
    const bfPct = bodyFat ? parseFloat(bodyFat) : null;
    const mmRaw = muscleMass ? parseFloat(muscleMass) : null;
    const mmKg = mmRaw != null ? (unit === "lb" ? lbToKg(mmRaw) : mmRaw) : null;

    startTransition(async () => {
      // Save preferred unit to profile
      if (unit !== currentUnit) {
        await fetch("/api/profile", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ unit }),
        });
      }
      const res = await fetch("/api/weight", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          weightKg,
          bodyFatPct: bfPct,
          muscleMassKg: mmKg,
        }),
      });
      if (res.ok) {
        setValue("");
        setBodyFat("");
        setMuscleMass("");
        router.refresh();
      } else {
        setError("Failed to save");
      }
    });
  }

  const displayLatest = latestWeightKg
    ? unit === "lb"
      ? `${kgToLb(latestWeightKg)} lb`
      : `${latestWeightKg.toFixed(1)} kg`
    : null;

  return (
    <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-medium uppercase tracking-wider text-[var(--color-text-muted)]">
          Log Weight
        </h2>
        <div className="flex rounded-lg border border-[var(--color-border)]">
          <button
            onClick={() => setUnit("lb")}
            className={`rounded-l-lg px-2.5 py-1 text-xs font-medium transition-colors ${
              unit === "lb" ? "bg-white/10 text-white" : "text-[var(--color-text-muted)]"
            }`}
          >
            lb
          </button>
          <button
            onClick={() => setUnit("kg")}
            className={`rounded-r-lg px-2.5 py-1 text-xs font-medium transition-colors ${
              unit === "kg" ? "bg-white/10 text-white" : "text-[var(--color-text-muted)]"
            }`}
          >
            kg
          </button>
        </div>
      </div>

      {displayLatest && (
        <p className="mb-3 text-xs text-[var(--color-text-muted)]">
          Latest: <span className="font-mono text-white">{displayLatest}</span>
        </p>
      )}

      <form onSubmit={handleSubmit} className="space-y-2">
        <div className="flex items-center gap-2">
          <input
            type="number"
            step="0.1"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={`Weight (${unit})`}
            className="flex-1 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2 text-sm placeholder:text-[var(--color-text-muted)]/50"
          />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <input
            type="number"
            step="0.1"
            value={bodyFat}
            onChange={(e) => setBodyFat(e.target.value)}
            placeholder="Body fat % (optional)"
            className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2 text-xs placeholder:text-[var(--color-text-muted)]/50"
          />
          <input
            type="number"
            step="0.1"
            value={muscleMass}
            onChange={(e) => setMuscleMass(e.target.value)}
            placeholder={`Muscle mass ${unit} (optional)`}
            className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2 text-xs placeholder:text-[var(--color-text-muted)]/50"
          />
        </div>
        {error && <p className="text-xs text-red-400">{error}</p>}
        <button
          type="submit"
          disabled={isPending || !value}
          className="w-full rounded-xl bg-white/10 py-2 text-sm font-medium transition-colors hover:bg-white/20 disabled:opacity-30"
        >
          {isPending ? "Saving..." : "Log Weight"}
        </button>
      </form>
    </div>
  );
}
