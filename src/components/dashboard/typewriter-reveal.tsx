"use client";

import { useEffect, useState } from "react";

/**
 * Typewriter reveal for the morning verdict's why-line + action-line.
 *
 * Fires ONCE per local day on the dashboard. Subsequent opens that
 * same day render as static text — per Emil's "never animate
 * keyboard-frequency UI" rule. A once-daily ritual is the inverse of
 * that frequency, which is what earns the typewriter here: this is the
 * coach speaking, not a UI shimmering. We make it once-per-day cheap
 * by checking `localStorage` against the user's local date.
 *
 * SSR-safety: the component renders the full text on the server. On
 * hydration, if we determine the animation should fire (new local day
 * AND prefers-reduced-motion is not set), we clear the text and start
 * typing. If localStorage is unavailable or reduced motion is on, the
 * pre-rendered static text remains untouched.
 *
 * The caret moves with the active line: it sits at the end of the
 * why-line during the why phase, then jumps to the action-line during
 * the action phase, then disappears.
 */

const STORAGE_KEY = "baseline:hero-typed-date";

// ~50 cps. Slow enough to read as "the coach is typing," fast enough
// to not feel like a bottleneck after you've seen it a few times.
const CHARS_PER_MS = 1 / 20;
const PAUSE_BETWEEN_LINES_MS = 180;

interface Props {
  whyLine: string;
  actionLine: string;
  /** Tailwind class for the action-line color, e.g. "text-[var(--color-yellow)]" */
  actionColorClass: string;
}

function localToday(): string {
  // YYYY-MM-DD in the user's local timezone, matching how we storage-
  // key "today" elsewhere in the app.
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

type Phase = "static" | "typing-why" | "between" | "typing-action" | "done";

export function TypewriterReveal({ whyLine, actionLine, actionColorClass }: Props) {
  // Default to fully-rendered so SSR HTML matches first paint. The
  // effect downgrades to typing only when warranted.
  const [whyText, setWhyText] = useState(whyLine);
  const [actionText, setActionText] = useState(actionLine);
  const [phase, setPhase] = useState<Phase>("static");

  useEffect(() => {
    // Decide whether to type.
    let shouldType = false;
    try {
      const prefersReduced =
        typeof window !== "undefined" &&
        window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      if (!prefersReduced) {
        const today = localToday();
        const last = window.localStorage.getItem(STORAGE_KEY);
        if (last !== today) {
          window.localStorage.setItem(STORAGE_KEY, today);
          shouldType = true;
        }
      }
    } catch {
      shouldType = false;
    }

    if (!shouldType) return;

    // Start typing. Reset to empty so the static text doesn't flash
    // before the animation kicks in.
    setWhyText("");
    setActionText("");
    setPhase("typing-why");

    const startedAt = performance.now();
    let frame = 0;
    let phaseRef: Phase = "typing-why";
    let pauseUntil = 0;

    const tick = (now: number) => {
      const elapsed = now - startedAt;

      if (phaseRef === "typing-why") {
        const i = Math.min(whyLine.length, Math.floor(elapsed * CHARS_PER_MS));
        setWhyText(whyLine.slice(0, i));
        if (i >= whyLine.length) {
          phaseRef = "between";
          pauseUntil = now + PAUSE_BETWEEN_LINES_MS;
          setPhase("between");
        }
      } else if (phaseRef === "between") {
        if (now >= pauseUntil) {
          phaseRef = "typing-action";
          setPhase("typing-action");
        }
      } else if (phaseRef === "typing-action") {
        const start = whyLine.length / CHARS_PER_MS + PAUSE_BETWEEN_LINES_MS;
        const j = Math.min(
          actionLine.length,
          Math.floor((elapsed - start) * CHARS_PER_MS),
        );
        setActionText(actionLine.slice(0, j));
        if (j >= actionLine.length) {
          phaseRef = "done";
          setPhase("done");
          return;
        }
      }

      frame = requestAnimationFrame(tick);
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [whyLine, actionLine]);

  const showWhyCaret = phase === "typing-why";
  const showActionCaret = phase === "between" || phase === "typing-action";

  return (
    <>
      <p className="mt-6 max-w-2xl text-base leading-relaxed text-[var(--color-text)] sm:text-lg">
        {whyText}
        {showWhyCaret && <span className="baseline-caret" aria-hidden="true" />}
      </p>
      <p
        className={`mt-1.5 max-w-2xl text-sm leading-relaxed sm:text-base ${actionColorClass}`}
      >
        {actionText}
        {showActionCaret && (
          <span className="baseline-caret" aria-hidden="true" />
        )}
      </p>
    </>
  );
}
