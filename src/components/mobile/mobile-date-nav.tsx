"use client";

import { useRouter, useSearchParams } from "next/navigation";

/**
 * Compact mobile date nav matching the "Baseline iOS" .datenav (‹ FRI · MAY 29 ›).
 * Same query-param navigation as the desktop DateNav.
 */

function todayStr(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function shiftDate(dateStr: string, days: number): string {
  const d = new Date(dateStr + "T12:00:00");
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function label(dateStr: string): string {
  const d = new Date(dateStr + "T12:00:00");
  const wd = d.toLocaleDateString("en-US", { weekday: "short" }).toUpperCase();
  const mo = d.toLocaleDateString("en-US", { month: "short" }).toUpperCase();
  return `${wd} · ${mo} ${d.getDate()}`;
}

export function MobileDateNav({ basePath }: { basePath: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const currentDate = searchParams.get("date") ?? todayStr();
  const isToday = currentDate === todayStr();

  function navigate(dateStr: string) {
    if (dateStr === todayStr()) router.push(basePath);
    else router.push(`${basePath}?date=${dateStr}`);
  }

  return (
    <div className="datenav">
      <button onClick={() => navigate(shiftDate(currentDate, -1))} aria-label="Previous day">‹</button>
      {/* Tapping the date opens the NATIVE date picker — an invisible
          <input type="date"> overlays the label, so any day is one tap
          away instead of N arrow presses. */}
      <span className="d" style={{ position: "relative" }}>
        {label(currentDate)}
        <input
          type="date"
          aria-label="Pick a date"
          value={currentDate}
          max={todayStr()}
          onClick={(e) => (e.currentTarget as HTMLInputElement & { showPicker?: () => void }).showPicker?.()}
          onChange={(e) => e.target.value && navigate(e.target.value)}
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            opacity: 0,
            border: 0,
            padding: 0,
            WebkitAppearance: "none",
            appearance: "none",
          }}
        />
      </span>
      <button onClick={() => navigate(shiftDate(currentDate, 1))} disabled={isToday} aria-label="Next day">›</button>
    </div>
  );
}
