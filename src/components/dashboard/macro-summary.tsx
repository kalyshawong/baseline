interface MacroData {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  entryCount: number;
}

function MacroBar({ label, value, max, color }: { label: string; value: number; max: number; color: string }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div>
      <div className="flex justify-between text-xs">
        <span className="text-[var(--color-text-muted)]">{label}</span>
        <span className="font-mono">{value}g</span>
      </div>
      <div className="mt-1 h-1.5 rounded-full bg-[var(--color-surface-2)]">
        <div
          className={`h-full rounded-full ${color} transition-all duration-500`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

export function MacroSummary({ data, compact }: { data: MacroData | null; compact?: boolean }) {
  if (!data || data.entryCount === 0) {
    if (compact) return null;
    return (
      <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 text-center text-sm text-[var(--color-text-muted)]">
        <p>No food logged today.</p>
      </div>
    );
  }

  // Rough daily targets for an active woman (~1800-2200 cal)
  const targets = { calories: 2000, protein: 140, carbs: 200, fat: 65 };

  if (compact) {
    return (
      <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
        <div className="flex items-center justify-between">
          <p className="text-xs font-medium uppercase tracking-wider text-[var(--color-text-muted)]">
            Nutrition
          </p>
          <p className="text-xs text-[var(--color-text-muted)]">{data.entryCount} items</p>
        </div>
        <p className="mt-1 text-2xl font-bold tabular-nums">
          {Math.round(data.calories)}
          <span className="ml-1 text-sm font-normal text-[var(--color-text-muted)]">cal</span>
        </p>
        <div className="mt-2 flex gap-4 text-xs font-mono">
          <span className="text-blue-400">{Math.round(data.protein)}g P</span>
          <span className="text-amber-400">{Math.round(data.carbs)}g C</span>
          <span className="text-rose-400">{Math.round(data.fat)}g F</span>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium uppercase tracking-wider text-[var(--color-text-muted)]">
          Daily Nutrition
        </h2>
        <span className="text-xs text-[var(--color-text-muted)]">{data.entryCount} items logged</span>
      </div>
      <div className="mt-3 flex items-baseline gap-2">
        <span className="text-3xl font-bold tabular-nums">{Math.round(data.calories)}</span>
        <span className="text-sm text-[var(--color-text-muted)]">/ {targets.calories} cal</span>
      </div>
      <div className="mt-1 h-2 rounded-full bg-[var(--color-surface-2)]">
        <div
          className="h-full rounded-full bg-white/30 transition-all duration-500"
          style={{ width: `${Math.min(100, (data.calories / targets.calories) * 100)}%` }}
        />
      </div>
      <div className="mt-4 space-y-2.5">
        <MacroBar label="Protein" value={Math.round(data.protein)} max={targets.protein} color="bg-blue-500/60" />
        <MacroBar label="Carbs" value={Math.round(data.carbs)} max={targets.carbs} color="bg-amber-500/60" />
        <MacroBar label="Fat" value={Math.round(data.fat)} max={targets.fat} color="bg-rose-500/60" />
      </div>
    </div>
  );
}
