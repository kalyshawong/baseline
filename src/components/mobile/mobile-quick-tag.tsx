"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

/**
 * Mobile Quick Tag — faithful to the "Baseline iOS" Mind mock (chips → specific
 * tags, custom tag + time + Tag). Same /api/tags endpoint as the desktop
 * QuickTag, so tagging behaves identically.
 */

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

function currentTimeString(): string {
  const now = new Date();
  return `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
}

export function MobileQuickTag({ dateStr }: { dateStr?: string } = {}) {
  const router = useRouter();
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [flash, setFlash] = useState<string | null>(null);
  const [customTag, setCustomTag] = useState("");
  const [time, setTime] = useState(currentTimeString);
  const [timeUnknown, setTimeUnknown] = useState(false);

  function buildTimestamp(): string {
    const base = dateStr ? new Date(dateStr + "T00:00:00") : new Date();
    const [h, m] = timeUnknown ? [0, 0] : time.split(":").map(Number);
    return new Date(base.getFullYear(), base.getMonth(), base.getDate(), h, m).toISOString();
  }

  function handleTag(category: string, tag: string) {
    startTransition(async () => {
      const res = await fetch("/api/tags", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tag,
          category,
          metadata: timeUnknown ? { timeUnknown: true } : undefined,
          timestamp: buildTimestamp(),
        }),
      });
      if (res.ok) {
        setFlash(tag);
        setCustomTag("");
        setTime(currentTimeString());
        setTimeUnknown(false);
        setTimeout(() => {
          setFlash(null);
          setActiveCategory(null);
        }, 1500);
        router.refresh();
      }
    });
  }

  function handleCustom(e: React.FormEvent) {
    e.preventDefault();
    if (!customTag.trim()) return;
    handleTag("custom", customTag.trim());
  }

  const activePreset = presets.find((p) => p.category === activeCategory);

  return (
    <div className="panel">
      <div className="ph"><span className="ov">Quick Tag</span></div>

      {flash && (
        <div className="chip" style={{ background: "color-mix(in oklch,var(--green),transparent 82%)", color: "var(--green)", marginBottom: 10 }}>
          Tagged: {flash}
        </div>
      )}

      <div className="chips">
        {presets.map((p) => (
          <button
            key={p.category}
            type="button"
            onClick={() => {
              const next = activeCategory === p.category ? null : p.category;
              setActiveCategory(next);
              if (next) setTime(currentTimeString());
            }}
            className={`tagchip ${activeCategory === p.category ? "on" : ""}`}
          >
            {p.category}
          </button>
        ))}
      </div>

      {activePreset && (
        <div style={{ marginTop: 11, border: "1px solid var(--line)", background: "var(--surf2)", padding: 11 }}>
          <div className="ov" style={{ marginBottom: 8 }}>Select specific tag</div>
          <div className="chips">
            {activePreset.tags.map((tag) => (
              <button
                key={tag}
                type="button"
                onClick={() => handleTag(activePreset.category, tag)}
                disabled={isPending}
                className="tagchip"
              >
                {tag}
              </button>
            ))}
          </div>
        </div>
      )}

      <form onSubmit={handleCustom}>
        <input
          className="field"
          style={{ marginTop: 11 }}
          value={customTag}
          onChange={(e) => setCustomTag(e.target.value)}
          placeholder="Custom tag (e.g. cold shower, sauna)"
        />
        <div className="qr">
          {!timeUnknown && (
            <input
              type="time"
              className="timefield"
              style={{ flex: 1, justifyContent: "center", colorScheme: "dark" }}
              value={time}
              onChange={(e) => setTime(e.target.value)}
              aria-label="Tag time"
            />
          )}
          <button type="submit" className="btn" style={{ flex: "none" }} disabled={isPending || !customTag.trim()}>
            Tag
          </button>
        </div>
        <label className="check" style={{ marginTop: 10 }} aria-checked={timeUnknown}>
          <input
            type="checkbox"
            checked={timeUnknown}
            onChange={(e) => setTimeUnknown(e.target.checked)}
            style={{ accentColor: "var(--gold)" }}
          />
          Sometime today — don&apos;t remember time
        </label>
      </form>
    </div>
  );
}
