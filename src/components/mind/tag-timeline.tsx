"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

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
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (tags.length === 0) return null;

  function handleDelete(id: string) {
    setError(null);
    startTransition(async () => {
      const res = await fetch("/api/tags", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      if (res.ok) {
        router.refresh();
      } else {
        setError("Failed to delete tag");
      }
    });
  }

  return (
    <div>
      <h2 className="mb-3 text-sm font-medium uppercase tracking-wider text-[var(--color-text-muted)]">
        Recent Tags
      </h2>
      {error && <p className="mb-2 text-xs text-red-400">{error}</p>}
      <div className="space-y-2">
        {tags.map((t) => (
          <div
            key={t.id}
            className="group flex items-center gap-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-2.5"
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
            <button
              onClick={() => handleDelete(t.id)}
              disabled={isPending}
              className="shrink-0 rounded px-1.5 py-0.5 text-[var(--color-text-muted)] opacity-0 transition-opacity hover:bg-red-500/20 hover:text-red-400 group-hover:opacity-100 disabled:opacity-50"
              title="Delete tag"
            >
              &times;
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
