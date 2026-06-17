"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

/**
 * "Start this session" button for /body/hyrox. Replaces the old
 * inert "(Phase 2)" stub. POSTs to /api/hyrox/sessions to create a
 * HyroxSession row tied to today + the active plan, then flips into a
 * "Session logged" success state and refreshes the page so the
 * recommendation engine sees the new daysSinceLastHardSession value.
 *
 * V1 scope: log the prescription only. Detailed per-set metrics
 * (station times, weights, intervals) live on a follow-up "log
 * details" form that writes to WorkoutSession.
 *
 * The button respects today's existing state — if the API returns
 * `alreadyLogged: true`, we show the same "Session logged" state
 * without an error, so repeat clicks are safe.
 */

interface Props {
  sessionType: string;
  prescriptionNotes?: string | null;
  rationale?: string | null;
  /** If a session was ALREADY logged today (server detected on render),
   *  the button mounts in the logged state. */
  initiallyLogged?: boolean;
}

export function StartHyroxSessionButton({
  sessionType,
  prescriptionNotes,
  rationale,
  initiallyLogged = false,
}: Props) {
  const router = useRouter();
  const [logged, setLogged] = useState(initiallyLogged);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  async function handleClick() {
    if (logged || pending) return;
    setError(null);

    try {
      const res = await fetch("/api/hyrox/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionType,
          prescriptionNotes,
          rationale,
        }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error ?? `Failed (${res.status})`);
      }
      setLogged(true);
      // Refresh so /body/hyrox re-renders with daysSinceLastHardSession = 0,
      // which can change the next recommendation.
      startTransition(() => {
        router.refresh();
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to log session");
    }
  }

  if (logged) {
    return (
      <div className="mt-2 w-full border border-[color-mix(in_srgb,var(--color-green)_30%,transparent)] bg-[color-mix(in_srgb,var(--color-green)_10%,transparent)] px-4 py-2 text-center text-sm font-medium text-[var(--color-green)]">
        Session logged ✓
      </div>
    );
  }

  return (
    <div className="mt-2 space-y-1">
      <button
        type="button"
        onClick={handleClick}
        disabled={pending}
        className="w-full bg-amber-500/20 px-4 py-2 text-sm font-medium text-amber-400 transition duration-150 ease-out-strong hover:bg-amber-500/30 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
      >
        {pending ? "Logging…" : "Start this session"}
      </button>
      {error && (
        <p className="text-xs text-[var(--color-red)]">{error}</p>
      )}
    </div>
  );
}
