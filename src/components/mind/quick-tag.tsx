"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

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

function currentTimeString(): string {
  const now = new Date();
  return `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
}

export function QuickTag({ dateStr }: { dateStr?: string } = {}) {
  const router = useRouter();
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [flash, setFlash] = useState<string | null>(null);
  const [customTag, setCustomTag] = useState("");
  const [tagNotes, setTagNotes] = useState("");
  const [tagTime, setTagTime] = useState(currentTimeString);
  const [timeUnknown, setTimeUnknown] = useState(false);

  function resetForm() {
    setTagNotes("");
    setCustomTag("");
    setTagTime(currentTimeString());
    setTimeUnknown(false);
  }

  function buildTimestamp(): string {
    // Base date = viewed date (if any) or today local
    const base = dateStr ? new Date(dateStr + "T00:00:00") : new Date();
    // When time is unknown we anchor at 00:00 local of the day so downstream
    // analyses that only key off the date (e.g. insights.ts) still bucket it
    // correctly, and the UI can render "sometime today" from the metadata flag
    // instead of showing a fake time of day.
    const [h, m] = timeUnknown ? [0, 0] : tagTime.split(":").map(Number);
    const ts = new Date(base.getFullYear(), base.getMonth(), base.getDate(), h, m);
    return ts.toISOString();
  }

  function buildMetadata(): Record<string, unknown> | undefined {
    const meta: Record<string, unknown> = {};
    if (tagNotes) meta.notes = tagNotes;
    if (timeUnknown) meta.timeUnknown = true;
    return Object.keys(meta).length > 0 ? meta : undefined;
  }

  function handleTag(category: string, tag: string) {
    startTransition(async () => {
      const res = await fetch("/api/tags", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tag,
          category,
          metadata: buildMetadata(),
          timestamp: buildTimestamp(),
        }),
      });
      if (res.ok) {
        setFlash(tag);
        resetForm();
        setTimeout(() => {
          setFlash(null);
          setActiveCategory(null);
        }, 1500);
        router.refresh();
      } else {
        const data = await res.json().catch(() => ({}));
        setFlash(null);
        setTagNotes(`Error: ${data.error ?? "Failed to save tag"}`);
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
            onClick={() => {
              const next = activeCategory === p.category ? null : p.category;
              setActiveCategory(next);
              if (next) setTagTime(currentTimeString()); // reset time to now on open
            }}
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
        <div className="mt-4 space-y-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-2)] p-3">
          {/* Specific tags for the selected category */}
          <div>
            <p className="mb-2 text-xs font-medium text-[var(--color-text-muted)]">
              Select specific tag
            </p>
            <div className="flex flex-wrap gap-2">
              {presets
                .find((p) => p.category === activeCategory)
                ?.tags.map((tag) => (
                  <button
                    key={tag}
                    onClick={() => handleTag(activeCategory, tag)}
                    disabled={isPending}
                    className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-1.5 text-xs transition-colors hover:bg-white/10 disabled:opacity-50"
                  >
                    {tag}
                  </button>
                ))}
            </div>
          </div>

          {/* Time picker */}
          <div className="flex flex-wrap items-center gap-2">
            <label className="text-xs text-[var(--color-text-muted)]">Time:</label>
            <input
              type="time"
              value={tagTime}
              onChange={(e) => setTagTime(e.target.value)}
              disabled={timeUnknown}
              className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-2 py-1.5 text-xs [color-scheme:dark] disabled:opacity-40"
            />
            <button
              type="button"
              onClick={() => setTagTime(currentTimeString())}
              disabled={timeUnknown}
              className="text-xs text-[var(--color-text-muted)] underline hover:text-white disabled:opacity-40 disabled:no-underline"
            >
              Now
            </button>
            <label className="ml-auto flex items-center gap-1.5 text-xs text-[var(--color-text-muted)] cursor-pointer select-none">
              <input
                type="checkbox"
                checked={timeUnknown}
                onChange={(e) => setTimeUnknown(e.target.checked)}
                className="accent-[var(--color-text-muted)]"
              />
              Sometime today — don&apos;t remember time
            </label>
          </div>

          {/* Notes */}
          <input
            type="text"
            value={tagNotes}
            onChange={(e) => setTagNotes(e.target.value)}
            placeholder="Notes (duration, amount, context...)"
            className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-xs placeholder:text-[var(--color-text-muted)]/50"
          />
        </div>
      )}

      {/* Custom tag input */}
      <form onSubmit={handleCustomSubmit} className="mt-3 space-y-2">
        <div className="flex flex-wrap gap-2">
          <input
            type="text"
            value={customTag}
            onChange={(e) => setCustomTag(e.target.value)}
            placeholder="Custom tag (e.g. cold shower, creatine, sauna)"
            className="min-w-0 flex-1 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2 text-xs placeholder:text-[var(--color-text-muted)]/50"
          />
          {!timeUnknown && (
            <>
              <input
                type="time"
                value={tagTime}
                onChange={(e) => setTagTime(e.target.value)}
                aria-label="Tag time"
                className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] px-2 py-2 text-xs [color-scheme:dark]"
              />
              <button
                type="button"
                onClick={() => setTagTime(currentTimeString())}
                className="rounded-lg border border-[var(--color-border)] px-2 py-2 text-xs text-[var(--color-text-muted)] hover:text-white"
              >
                Now
              </button>
            </>
          )}
          <button
            type="submit"
            disabled={isPending || !customTag.trim()}
            className="rounded-lg bg-white/10 px-3 py-2 text-xs font-medium transition-colors hover:bg-white/20 disabled:opacity-30"
          >
            Tag
          </button>
        </div>
        <label className="flex items-center gap-1.5 text-xs text-[var(--color-text-muted)] cursor-pointer select-none">
          <input
            type="checkbox"
            checked={timeUnknown}
            onChange={(e) => setTimeUnknown(e.target.checked)}
            className="accent-[var(--color-text-muted)]"
          />
          Sometime today — don&apos;t remember time
        </label>
      </form>
    </div>
  );
}
