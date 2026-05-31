"use client";

import { useState, useTransition } from "react";

const phases = [
  { id: "menstrual", label: "Menstrual" },
  { id: "follicular", label: "Follicular" },
  { id: "ovulation", label: "Ovulation" },
  { id: "luteal", label: "Luteal" },
] as const;

/**
 * Phase picker — row of 4 options. Active = red fill per design.
 * Design ref: Baseline Body.html → .phasepick
 */
export function CyclePhaseSelector({
  currentPhase,
}: {
  currentPhase: string | null;
}) {
  const [selected, setSelected] = useState(currentPhase);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleSelect(phaseId: string) {
    const previous = selected;
    setSelected(phaseId);
    setError(null);
    startTransition(async () => {
      try {
        const res = await fetch("/api/cycle-phase", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ phase: phaseId }),
        });
        if (!res.ok) throw new Error("Save failed");
      } catch {
        setSelected(previous);
        setError("Failed to save — try again");
      }
    });
  }

  return (
    <div className="flex gap-2">
      {phases.map((phase) => (
        <button
          key={phase.id}
          onClick={() => handleSelect(phase.id)}
          disabled={isPending}
          className="flex-1 text-center text-[11px] font-bold uppercase tracking-[0.06em] py-[10px] px-[6px] cursor-pointer transition-all"
          style={{
            background:
              selected === phase.id
                ? "var(--color-red)"
                : "var(--color-surface-2)",
            color:
              selected === phase.id
                ? "var(--color-text)"
                : "var(--color-text-muted)",
          }}
        >
          {phase.label}
        </button>
      ))}
      {error && (
        <p className="text-xs text-[var(--color-red)] mt-1">{error}</p>
      )}
    </div>
  );
}
