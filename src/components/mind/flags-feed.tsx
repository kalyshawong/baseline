"use client";

import { useState } from "react";
import Link from "next/link";
import type { Flag } from "@/lib/flags";

/**
 * The Flags feed — "what doesn't add up." Sibling to InsightsFeed but a
 * different intent: contradictions, implausible data, and assumption
 * mismatches the system surfaces unprompted. See lib/flags.ts.
 *
 * Dismiss is session-only for v1 (no persistence schema yet) — it clears the
 * card until reload, enough to keep the feed from nagging within a session.
 */

const severityCard: Record<string, string> = {
  needs_you: "insight-card insight-card-a",
  calibration: "insight-card insight-card-muted",
  resolved: "insight-card insight-card-g",
};

const severityDot: Record<string, string> = {
  needs_you: "bg-[var(--color-yellow)]",
  calibration: "bg-[var(--color-faint)]",
  resolved: "bg-[var(--color-green)]",
};

const kindLabel: Record<string, string> = {
  your_data: "your data",
  my_assumption: "my assumption",
};

export function FlagsFeed({ flags }: { flags: Flag[] }) {
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const visible = flags.filter((f) => !dismissed.has(f.id));

  if (visible.length === 0) {
    return (
      <div className="empty-state">
        <p className="text-sm">Nothing looks off right now.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {visible.map((f) => (
        <div key={f.id} className={severityCard[f.severity]}>
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-2">
              <span
                className={`h-2 w-2 shrink-0 rounded-full ${severityDot[f.severity]}`}
                aria-hidden="true"
              />
              <p className="text-sm font-medium">{f.title}</p>
            </div>
            <span className="pill pill-muted shrink-0">{kindLabel[f.kind]}</span>
          </div>

          <p className="mt-2 text-xs leading-relaxed text-[var(--color-text-muted)]">
            {f.body}
          </p>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            {f.actions.map((a) => (
              <Link
                key={a.href + a.label}
                href={a.href}
                className="border border-[var(--color-border)] px-3 py-1 text-xs font-medium transition duration-150 ease-out-strong hover:bg-white/10 active:scale-[0.97]"
              >
                {a.label}
              </Link>
            ))}
            <button
              type="button"
              onClick={() =>
                setDismissed((s) => new Set(s).add(f.id))
              }
              className="px-3 py-1 text-xs text-[var(--color-text-muted)] transition duration-150 ease-out-strong hover:text-[var(--color-text)] active:scale-[0.97]"
            >
              Dismiss
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
