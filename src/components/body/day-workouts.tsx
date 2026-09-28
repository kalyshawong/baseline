import Link from "next/link";
import { kgToLb } from "@/lib/tdee";

export interface DayWorkoutSession {
  id: string;
  templateName: string | null;
  sets: { setNumber: number; reps: number; weight: number; isWarmup: boolean; exercise: { name: string } }[];
}

/**
 * What she did on the viewed date: every exercise and its sets, so going
 * back to a day answers "what did I do?". Free-text logging can split one
 * workout into several sessions, so all of the day's working sets are merged
 * and grouped by exercise in the order they were done.
 * Weights are stored in kg and shown in the profile unit.
 */
export function DayWorkouts({
  sessions,
  dateLabel,
  unit,
  variant,
}: {
  sessions: DayWorkoutSession[];
  dateLabel: string;
  unit: "lb" | "kg";
  variant: "mobile" | "desktop";
}) {
  const fmt = (kg: number) => (kg === 0 ? "BW" : unit === "lb" ? `${kgToLb(kg)}` : `${Math.round(kg * 10) / 10}`);

  const byEx = new Map<string, { reps: number; weight: number }[]>();
  for (const s of sessions) {
    for (const set of [...s.sets].filter((x) => !x.isWarmup).sort((a, b) => a.setNumber - b.setNumber)) {
      const arr = byEx.get(set.exercise.name) ?? [];
      arr.push({ reps: set.reps, weight: set.weight });
      byEx.set(set.exercise.name, arr);
    }
  }

  const rows = [...byEx.entries()].map(([name, sets]) => {
    // "3 × 10 @ 40 lb" when every set matches; otherwise each set.
    const same = sets.every((x) => x.reps === sets[0].reps && x.weight === sets[0].weight);
    const detail = same
      ? `${sets.length} × ${sets[0].reps} @ ${fmt(sets[0].weight)}`
      : sets.map((x) => `${x.reps}@${fmt(x.weight)}`).join(", ");
    const u = sets.some((x) => x.weight > 0) ? ` ${unit}` : "";
    if (variant === "mobile") {
      return (
        <div key={name} className="lrow">
          <div className="nm">{name}</div>
          <div className="rt"><div className="sm">{detail}{u}</div></div>
        </div>
      );
    }
    return (
      <div key={name} className="flex items-center justify-between bg-[var(--color-surface-2)] px-[14px] py-[9px] text-[13px] mt-[6px]">
        <span className="font-semibold">{name}</span>
        <span className="text-[11.5px] text-[var(--color-faint)] tabular-nums">{detail}{u}</span>
      </div>
    );
  });

  const body =
    rows.length === 0 ? (
      <p style={{ fontSize: 12.5, color: "var(--dim, var(--color-text-muted))" }}>No workouts logged on {dateLabel}.</p>
    ) : (
      <>
        {rows}
        {sessions.length === 1 && (
          <Link href={`/body/workout/${sessions[0].id}`} className="linklike" style={{ display: "inline-block", marginTop: 10, fontSize: 12 }}>
            Edit workout
          </Link>
        )}
      </>
    );

  return variant === "mobile" ? (
    <div className="listcard">
      <div className="ov" style={{ marginBottom: 12 }}>Workouts · {dateLabel}</div>
      {body}
    </div>
  ) : (
    <div className="panel p-[22px_24px]">
      <p className="ov mb-[14px]">Workouts · {dateLabel}</p>
      {body}
    </div>
  );
}
