"use client";

import { useEffect, useState } from "react";

/**
 * Minimizable card wrapper — her ask (2026-08-20): "just a button to
 * minimize, not take it away" (e.g. the cycle card when showing the app to
 * friends/family). Collapsed state is a slim labeled bar; tap to expand.
 * Remembered per-card in localStorage, so it survives reloads and app
 * relaunches until she expands it again.
 */

const STORE = "bl_min";

function readStore(): Record<string, boolean> {
  try {
    return JSON.parse(localStorage.getItem(STORE) ?? "{}");
  } catch {
    return {};
  }
}

export function MinCard({
  id,
  label,
  children,
}: {
  /** Stable key for persistence, e.g. "cycle-today". */
  id: string;
  /** Shown on the collapsed bar. */
  label: string;
  children: React.ReactNode;
}) {
  const [min, setMin] = useState(false);

  useEffect(() => {
    setMin(readStore()[id] === true);
  }, [id]);

  function set(next: boolean) {
    setMin(next);
    try {
      const m = readStore();
      m[id] = next;
      localStorage.setItem(STORE, JSON.stringify(m));
    } catch {
      /* private mode etc. — collapse still works for this session */
    }
  }

  if (min) {
    return (
      <button
        type="button"
        onClick={() => set(false)}
        className="panel"
        style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%", padding: "10px 16px", cursor: "pointer", textAlign: "left" }}
        aria-label={`Expand ${label}`}
      >
        <span className="ov">{label}</span>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: "var(--faint, var(--color-text-muted))" }}>
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>
    );
  }

  return (
    <div style={{ position: "relative" }}>
      <button
        type="button"
        onClick={() => set(true)}
        aria-label={`Minimize ${label}`}
        style={{ position: "absolute", top: 10, right: 12, zIndex: 2, background: "none", border: "none", padding: 4, cursor: "pointer", color: "var(--faint, var(--color-text-muted))", lineHeight: 0 }}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="m18 15-6-6-6 6" />
        </svg>
      </button>
      {children}
    </div>
  );
}
