"use client";

import { useEffect, useState } from "react";

/**
 * Cycle card for the desktop evidence column (Claude Design desktop grid,
 * 2026-09-21): phase + temp inside one panel, with the Hide toggle in the
 * panel header instead of a separate bar above it. Shares MinCard's
 * localStorage key ("bl_min" / "cycle-today-d") so a hidden card stays
 * hidden across both layouts.
 */
const STORE = "bl_min";
const ID = "cycle-today-d";

const PHASE: Record<string, { label: string; color: string }> = {
  menstrual: { label: "MENSTRUAL", color: "var(--red)" },
  follicular: { label: "FOLLICULAR", color: "var(--green)" },
  ovulation: { label: "OVULATION", color: "var(--amber)" },
  luteal: { label: "LUTEAL", color: "var(--blue)" },
};

function readStore(): Record<string, boolean> {
  try {
    return JSON.parse(localStorage.getItem(STORE) ?? "{}");
  } catch {
    return {};
  }
}

export function CycleCardDesktop({
  phase,
  dayNumber,
  temperatureDeviationC,
}: {
  phase: string | null;
  dayNumber: number | null;
  temperatureDeviationC: number | null;
}) {
  const [min, setMin] = useState(false);
  useEffect(() => setMin(readStore()[ID] === true), []);
  const toggle = () =>
    setMin((prev) => {
      const next = !prev;
      try {
        const m = readStore();
        m[ID] = next;
        localStorage.setItem(STORE, JSON.stringify(m));
      } catch {
        /* private mode — still toggles for this session */
      }
      return next;
    });

  const cfg = phase ? PHASE[phase] : null;
  const temp =
    temperatureDeviationC != null
      ? `${temperatureDeviationC > 0 ? "+" : ""}${temperatureDeviationC.toFixed(2)}°`
      : null;
  const tempColor =
    temperatureDeviationC == null
      ? undefined
      : temperatureDeviationC > 0.05
        ? "var(--amber)"
        : temperatureDeviationC < -0.05
          ? "var(--blue)"
          : undefined;

  return (
    <div className="panel tight cyc">
      <div className="ph" style={min ? { marginBottom: 0 } : undefined}>
        <span className="ov">Cycle</span>
        <button type="button" className="hide" onClick={toggle} aria-expanded={!min} style={{ background: "none", border: "none" }}>
          {min ? "Show ⌄" : "Hide ⌃"}
        </button>
      </div>
      {!min &&
        (cfg ? (
          <>
            <div className="state" style={{ color: cfg.color }}>
              <span className="dot" style={{ background: cfg.color }} />
              {cfg.label}
            </div>
            <div className="temp">
              {dayNumber != null && (
                <>
                  <div className="k">Day</div>
                  <div className="v num">{dayNumber}</div>
                </>
              )}
              {temp && (
                <>
                  <div className="k">Temp</div>
                  <div className="v num" style={{ color: tempColor }}>
                    {temp}
                  </div>
                </>
              )}
            </div>
            {temp && <div className="note">Temp alone false-positives ~8–15% — period start still needs a log.</div>}
          </>
        ) : (
          <div className="note" style={{ fontSize: 13 }}>
            No recent cycle data.
          </div>
        ))}
    </div>
  );
}
