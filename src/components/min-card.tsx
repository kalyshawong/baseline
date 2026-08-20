"use client";

import { useEffect, useState } from "react";

/**
 * Minimizable card wrapper — her ask (2026-08-20): "just a button to
 * minimize, not take it away" (cycle cards, the Mind findings card with the
 * sex correlation, etc. — for handing the phone to friends/family).
 *
 * v2: the first version hid the control in a floating 14px arrow that
 * overlapped card content ("where is the hide?"). Now it's an always-visible
 * slim bar: label + chevron, tap anywhere on it to toggle. Collapsed =
 * bar only. Remembered per-card in localStorage across reloads/relaunches.
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
  /** Shown on the toggle bar. */
  label: string;
  children: React.ReactNode;
}) {
  const [min, setMin] = useState(false);

  useEffect(() => {
    setMin(readStore()[id] === true);
  }, [id]);

  function toggle() {
    setMin((prev) => {
      const next = !prev;
      try {
        const m = readStore();
        m[id] = next;
        localStorage.setItem(STORE, JSON.stringify(m));
      } catch {
        /* private mode etc. — toggle still works for this session */
      }
      return next;
    });
  }

  return (
    <div>
      <button
        type="button"
        onClick={toggle}
        aria-label={`${min ? "Expand" : "Minimize"} ${label}`}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          width: "100%",
          padding: "9px 14px",
          cursor: "pointer",
          textAlign: "left",
          background: "var(--surf2, var(--color-surface-2))",
          border: "none",
          marginBottom: min ? 0 : 8,
        }}
      >
        <span className="ov">{label}</span>
        <span className="ov" style={{ display: "flex", alignItems: "center", gap: 6 }}>
          {min ? "Show" : "Hide"}
          <svg
            width="13"
            height="13"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ transform: min ? "none" : "rotate(180deg)" }}
          >
            <path d="m6 9 6 6 6-6" />
          </svg>
        </span>
      </button>
      {!min && children}
    </div>
  );
}
