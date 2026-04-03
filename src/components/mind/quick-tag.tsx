"use client";

import { useState, useTransition } from "react";

const presets = [
  { category: "music", tags: ["lo-fi", "classical", "ambient", "binaural"] },
  { category: "breathing", tags: ["box breathing", "wim hof", "4-7-8", "physiological sigh"] },
  { category: "caffeine", tags: ["coffee", "espresso", "matcha", "pre-workout"] },
  { category: "alcohol", tags: ["wine", "beer", "spirits"] },
  { category: "meditation", tags: ["guided", "unguided", "body scan", "walking"] },
  { category: "exercise", tags: ["strength", "cardio", "yoga", "walk", "rest day"] },
  { category: "social", tags: ["social event", "alone time", "deep conversation"] },
  { category: "study", tags: ["deep work", "reading", "lecture", "practice"] },
];

const categoryColors: Record<string, string> = {
  music: "bg-violet-500/20 text-violet-400 border-violet-500/30",
  breathing: "bg-cyan-500/20 text-cyan-400 border-cyan-500/30",
  caffeine: "bg-amber-500/20 text-amber-400 border-amber-500/30",
  alcohol: "bg-rose-500/20 text-rose-400 border-rose-500/30",
  meditation: "bg-indigo-500/20 text-indigo-400 border-indigo-500/30",
  exercise: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
  social: "bg-pink-500/20 text-pink-400 border-pink-500/30",
  study: "bg-blue-500/20 text-blue-400 border-blue-500/30",
};

export function QuickTag() {
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [flash, setFlash] = useState<string | null>(null);
  const [customTag, setCustomTag] = useState("");
  const [tagNotes, setTagNotes] = useState("");

  function handleTag(category: string, tag: string) {
    startTransition(async () => {
      const res = await fetch("/api/tags", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tag,
          category,
          metadata: tagNotes ? { notes: tagNotes } : undefined,
        }),
      });
      if (res.ok) {
        setFlash(tag);
        setTagNotes("");
        setCustomTag("");
        setTimeout(() => { setFlash(null); setActiveCategory(null); }, 1500);
      }
    });
  }

  function handleCustomSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!customTag.trim()) return;
    handleTag("custom", customTag.trim());
  }

  return (
    <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
      <h2 className="mb-3 text-sm font-medium uppercase tracking-wider text-[var(--color-text-muted)]">
        Quick Tag
      </h2>
      {flash && (
        <div className="mb-3 rounded-lg bg-emerald-500/10 px-3 py-2 text-xs text-emerald-400">
          Tagged: {flash}
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        {presets.map((p) => (
          <button
            key={p.category}
            onClick={() => setActiveCategory(activeCategory === p.category ? null : p.category)}
            className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-all ${
              activeCategory === p.category
                ? categoryColors[p.category]
                : "border-[var(--color-border)] text-[var(--color-text-muted)] hover:border-[var(--color-text-muted)]/50"
            }`}
          >
            {p.category}
          </button>
        ))}
      </div>
      {activeCategory && (
        <div className="mt-3 flex flex-wrap gap-2">
          {presets
            .find((p) => p.category === activeCategory)
            ?.tags.map((tag) => (
              <button
                key={tag}
                onClick={() => handleTag(activeCategory, tag)}
                disabled={isPending}
                className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-1.5 text-xs transition-colors hover:bg-white/10 disabled:opacity-50"
              >
                {tag}
              </button>
            ))}
        </div>
      )}

      {/* Notes field for any tag */}
      {activeCategory && (
        <input
          type="text"
          value={tagNotes}
          onChange={(e) => setTagNotes(e.target.value)}
          placeholder="Optional notes (duration, amount, etc.)"
          className="mt-3 w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2 text-xs placeholder:text-[var(--color-text-muted)]/50"
        />
      )}

      {/* Custom tag input */}
      <form onSubmit={handleCustomSubmit} className="mt-3 flex gap-2">
        <input
          type="text"
          value={customTag}
          onChange={(e) => setCustomTag(e.target.value)}
          placeholder="Custom tag (e.g. cold shower, creatine, sauna)"
          className="flex-1 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2 text-xs placeholder:text-[var(--color-text-muted)]/50"
        />
        <button
          type="submit"
          disabled={isPending || !customTag.trim()}
          className="rounded-lg bg-white/10 px-3 py-2 text-xs font-medium transition-colors hover:bg-white/20 disabled:opacity-30"
        >
          Tag
        </button>
      </form>
    </div>
  );
}
