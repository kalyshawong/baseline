"use client";

import { useState, useTransition } from "react";

const phases = [
  {
    id: "menstrual",
    label: "Menstrual",
    color: "bg-red-500",
    emoji: "1",
    note: "Energy typically lowest. Focus on recovery, light movement, and technique work. Reduce volume 20-30%.",
  },
  {
    id: "follicular",
    label: "Follicular",
    color: "bg-emerald-500",
    emoji: "2",
    note: "Rising estrogen supports strength gains. Great window for PR attempts, heavy compounds, and high-volume sessions.",
  },
  {
    id: "ovulation",
    label: "Ovulation",
    color: "bg-amber-500",
    emoji: "3",
    note: "Peak strength and power output. Push intensity but watch joint laxity — estrogen peaks increase ligament flexibility.",
  },
  {
    id: "luteal",
    label: "Luteal",
    color: "bg-purple-500",
    emoji: "4",
    note: "Progesterone rises, body temp elevates. Shift toward moderate intensity, steady-state cardio, and endurance work.",
  },
] as const;

export function CyclePhaseSelector({
  currentPhase,
}: {
  currentPhase: string | null;
}) {
  const [selected, setSelected] = useState(currentPhase);
  const [isPending, startTransition] = useTransition();

  const activePhase = phases.find((p) => p.id === selected);

  function handleSelect(phaseId: string) {
    setSelected(phaseId);
    startTransition(async () => {
      await fetch("/api/cycle-phase", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phase: phaseId }),
      });
    });
  }

  return (
    <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6">
      <h2 className="mb-4 text-sm font-medium uppercase tracking-wider text-[var(--color-text-muted)]">
        Cycle Phase
      </h2>
      <div className="grid grid-cols-4 gap-2">
        {phases.map((phase) => (
          <button
            key={phase.id}
            onClick={() => handleSelect(phase.id)}
            disabled={isPending}
            className={`relative rounded-xl border px-3 py-3 text-center text-xs font-medium transition-all ${
              selected === phase.id
                ? `${phase.color}/15 border-current shadow-sm`
                : "border-[var(--color-border)] bg-[var(--color-surface-2)] hover:border-[var(--color-text-muted)]/30"
            }`}
            style={
              selected === phase.id
                ? {
                    color:
                      phase.id === "menstrual"
                        ? "#f87171"
                        : phase.id === "follicular"
                          ? "#34d399"
                          : phase.id === "ovulation"
                            ? "#fbbf24"
                            : "#a78bfa",
                  }
                : undefined
            }
          >
            <div
              className={`mx-auto mb-1.5 h-2 w-2 rounded-full ${phase.color} ${
                selected === phase.id ? "opacity-100" : "opacity-40"
              }`}
            />
            {phase.label}
          </button>
        ))}
      </div>
      {activePhase && (
        <div className="mt-4 rounded-lg bg-[var(--color-surface-2)] p-3 text-xs leading-relaxed text-[var(--color-text-muted)]">
          <span className="font-medium text-[var(--color-text)]">
            Training note:
          </span>{" "}
          {activePhase.note}
        </div>
      )}
    </div>
  );
}
