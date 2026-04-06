"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { activityLabel, kgToLb, lbToKg } from "@/lib/tdee";

interface Profile {
  bodyWeightKg: number | null;
  heightCm: number | null;
  age: number | null;
  sex: string | null;
  activityLevel: string;
  goal: string;
  targetWeightKg: number | null;
  unit: string;
}

export function WeightGoalSettings({ profile }: { profile: Profile | null }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const unit = (profile?.unit ?? "lb") as "lb" | "kg";

  const [goal, setGoal] = useState(profile?.goal ?? "maintain");
  const [targetWeight, setTargetWeight] = useState<string>(
    profile?.targetWeightKg
      ? unit === "lb"
        ? String(kgToLb(profile.targetWeightKg))
        : String(profile.targetWeightKg)
      : ""
  );
  const [activityLevel, setActivityLevel] = useState(profile?.activityLevel ?? "moderate");
  const [heightCm, setHeightCm] = useState(profile?.heightCm?.toString() ?? "");
  const [age, setAge] = useState(profile?.age?.toString() ?? "");
  const [sex, setSex] = useState(profile?.sex ?? "female");

  function save() {
    startTransition(async () => {
      const targetNum = targetWeight ? parseFloat(targetWeight) : null;
      const targetKg = targetNum != null ? (unit === "lb" ? lbToKg(targetNum) : targetNum) : null;

      await fetch("/api/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          goal,
          targetWeightKg: targetKg,
          activityLevel,
          heightCm: heightCm ? parseFloat(heightCm) : null,
          age: age ? parseInt(age) : null,
          sex,
        }),
      });
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-medium uppercase tracking-wider text-[var(--color-text-muted)]">
            Goal
          </h2>
          <p className="mt-1 text-sm font-semibold capitalize">
            {profile?.goal ?? "maintain"}
            {profile?.targetWeightKg && (
              <span className="ml-2 text-xs font-normal text-[var(--color-text-muted)]">
                target:{" "}
                {unit === "lb"
                  ? `${kgToLb(profile.targetWeightKg)} lb`
                  : `${profile.targetWeightKg} kg`}
              </span>
            )}
          </p>
          <p className="mt-1 text-xs text-[var(--color-text-muted)]">
            {activityLabel(profile?.activityLevel ?? "moderate")}
          </p>
        </div>
        <button
          onClick={() => setOpen(!open)}
          className="text-xs text-[var(--color-text-muted)] underline hover:text-white"
        >
          {open ? "Cancel" : "Edit"}
        </button>
      </div>

      {open && (
        <div className="mt-4 space-y-3 border-t border-[var(--color-border)] pt-4">
          <div>
            <label className="mb-1 block text-xs text-[var(--color-text-muted)]">Goal</label>
            <div className="grid grid-cols-3 gap-2">
              {["lose", "maintain", "gain"].map((g) => (
                <button
                  key={g}
                  onClick={() => setGoal(g)}
                  className={`rounded-lg border py-2 text-xs font-medium capitalize transition-all ${
                    goal === g
                      ? "border-white/30 bg-white/10 text-white"
                      : "border-[var(--color-border)] text-[var(--color-text-muted)]"
                  }`}
                >
                  {g}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs text-[var(--color-text-muted)]">
              Target weight ({unit})
            </label>
            <input
              type="number"
              step="0.1"
              value={targetWeight}
              onChange={(e) => setTargetWeight(e.target.value)}
              className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2 text-sm"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs text-[var(--color-text-muted)]">
              Activity level
            </label>
            <select
              value={activityLevel}
              onChange={(e) => setActivityLevel(e.target.value)}
              className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2 text-sm"
            >
              <option value="sedentary">{activityLabel("sedentary")}</option>
              <option value="light">{activityLabel("light")}</option>
              <option value="moderate">{activityLabel("moderate")}</option>
              <option value="active">{activityLabel("active")}</option>
              <option value="very_active">{activityLabel("very_active")}</option>
            </select>
          </div>

          <div>
            <p className="mb-1 text-xs text-[var(--color-text-muted)]">
              For accurate TDEE (Mifflin-St Jeor)
            </p>
            <div className="grid grid-cols-3 gap-2">
              <input
                type="number"
                value={heightCm}
                onChange={(e) => setHeightCm(e.target.value)}
                placeholder="Height (cm)"
                className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2 text-xs placeholder:text-[var(--color-text-muted)]/50"
              />
              <input
                type="number"
                value={age}
                onChange={(e) => setAge(e.target.value)}
                placeholder="Age"
                className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2 text-xs placeholder:text-[var(--color-text-muted)]/50"
              />
              <select
                value={sex}
                onChange={(e) => setSex(e.target.value)}
                className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2 text-xs"
              >
                <option value="female">Female</option>
                <option value="male">Male</option>
              </select>
            </div>
          </div>

          <button
            onClick={save}
            disabled={isPending}
            className="w-full rounded-xl bg-white/10 py-2 text-sm font-medium hover:bg-white/20 disabled:opacity-30"
          >
            {isPending ? "Saving..." : "Save"}
          </button>
        </div>
      )}
    </div>
  );
}
