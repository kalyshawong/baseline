"use client";

import { useState, useTransition } from "react";

/**
 * Mobile cycle card — design's .cyclecard with an interactive .phasepick.
 * Same /api/cycle-phase endpoint as the desktop CyclePhaseSelector.
 */

const phases = ["menstrual", "follicular", "ovulation", "luteal"];

export function MobileCycleCard({
  phase,
  headline,
  note,
}: {
  phase: string | null;
  headline: string;
  note: string;
}) {
  const [selected, setSelected] = useState(phase);
  const [, startTransition] = useTransition();

  function pick(p: string) {
    const prev = selected;
    setSelected(p);
    startTransition(async () => {
      try {
        const res = await fetch("/api/cycle-phase", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ phase: p }),
        });
        if (!res.ok) throw new Error();
      } catch {
        setSelected(prev);
      }
    });
  }

  return (
    <div className="cyclecard">
      <div className="ov" style={{ marginBottom: 7 }}>Cycle Phase</div>
      <div className="hd">{headline}</div>
      <div className="note">{note}</div>
      <div className="phasepick">
        {phases.map((p) => (
          <div key={p} className={`opt ${selected === p ? "on" : ""}`} onClick={() => pick(p)}>
            {p.charAt(0).toUpperCase() + p.slice(1)}
          </div>
        ))}
      </div>
    </div>
  );
}
