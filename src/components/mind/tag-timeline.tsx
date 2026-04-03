interface TagItem {
  id: string;
  tag: string;
  category: string;
  timestamp: string;
  experiment: { id: string; title: string } | null;
}

const categoryColors: Record<string, string> = {
  music: "bg-violet-500/20 text-violet-400",
  breathing: "bg-cyan-500/20 text-cyan-400",
  caffeine: "bg-amber-500/20 text-amber-400",
  alcohol: "bg-rose-500/20 text-rose-400",
  meditation: "bg-indigo-500/20 text-indigo-400",
  exercise: "bg-emerald-500/20 text-emerald-400",
  social: "bg-pink-500/20 text-pink-400",
  study: "bg-blue-500/20 text-blue-400",
  nutrition: "bg-orange-500/20 text-orange-400",
  custom: "bg-neutral-500/20 text-neutral-400",
};

function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function TagTimeline({ tags }: { tags: TagItem[] }) {
  if (tags.length === 0) return null;

  return (
    <div>
      <h2 className="mb-3 text-sm font-medium uppercase tracking-wider text-[var(--color-text-muted)]">
        Recent Tags
      </h2>
      <div className="space-y-2">
        {tags.map((t) => (
          <div
            key={t.id}
            className="flex items-center gap-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-2.5"
          >
            <span
              className={`rounded-full px-2 py-0.5 text-xs font-medium ${categoryColors[t.category] ?? categoryColors.custom}`}
            >
              {t.category}
            </span>
            <span className="text-sm">{t.tag}</span>
            {t.experiment && (
              <span className="text-xs text-[var(--color-text-muted)]">
                — {t.experiment.title}
              </span>
            )}
            <span className="ml-auto text-xs text-[var(--color-text-muted)]">
              {formatTime(t.timestamp)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
