"use client";

import { useRouter } from "next/navigation";
import { useCallback, useState, useTransition } from "react";

/**
 * Inline manual-workout entry for the dashboard. Renders when no
 * synced workout exists for today (or when the user wants to add
 * one before sync catches up).
 *
 * Designed for the fast case: the user opens the dashboard right
 * after a workout, taps "+ Log a workout," fills three fields, and
 * the workout appears with the WorkoutNotesBlock attached so they
 * can immediately dump narrative + analyze.
 *
 * Form fields are intentionally minimal — Hyrox / HIIT athletes can
 * always edit later. The goal is "row exists" with enough structured
 * data that the analyze prompt has something to chew on.
 */

interface CreatedWorkout {
  id: string;
  name: string;
}

function currentLocalTimeHHMM(): string {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/**
 * Combines a YYYY-MM-DD date (today's local date) with an HH:MM time
 * input into an ISO 8601 string in the user's local timezone.
 */
function buildIsoForToday(timeHHMM: string): string {
  const [h, m] = timeHHMM.split(":").map((v) => parseInt(v, 10));
  const d = new Date();
  d.setHours(h, m, 0, 0);
  return d.toISOString();
}

export function ManualWorkoutEntry() {
  const router = useRouter();
  const [expanded, setExpanded] = useState(false);
  const [name, setName] = useState("");
  const [durationMin, setDurationMin] = useState("");
  const [startTime, setStartTime] = useState(currentLocalTimeHHMM());
  const [avgHr, setAvgHr] = useState("");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const close = useCallback(() => {
    setExpanded(false);
    setName("");
    setDurationMin("");
    setStartTime(currentLocalTimeHHMM());
    setAvgHr("");
    setError(null);
  }, []);

  const submit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setError(null);

      const trimmedName = name.trim();
      const duration = Number(durationMin);

      if (!trimmedName) {
        setError("Name is required");
        return;
      }
      if (!Number.isFinite(duration) || duration < 1 || duration > 300) {
        setError("Duration must be 1–300 minutes");
        return;
      }

      const payload: Record<string, unknown> = {
        name: trimmedName,
        durationMinutes: duration,
        startTime: buildIsoForToday(startTime),
      };
      if (avgHr) {
        const hr = Number(avgHr);
        if (!Number.isFinite(hr) || hr < 30 || hr > 230) {
          setError("Avg HR must be 30–230 if provided");
          return;
        }
        payload.avgHeartRate = hr;
      }

      try {
        const res = await fetch("/api/workouts/manual", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (!res.ok) {
          const data = (await res.json().catch(() => ({}))) as {
            error?: string;
          };
          throw new Error(data.error ?? `Save failed (${res.status})`);
        }
        const created: CreatedWorkout = await res.json();
        // Reset and collapse — then refresh so the dashboard re-fetches
        // with the new row visible. router.refresh() preserves scroll +
        // form state in other client components, just re-runs the
        // server component query.
        close();
        startTransition(() => {
          router.refresh();
        });
        // Silence unused-var lint: we don't display `created`, but
        // having a typed local helps if we later want optimistic UI.
        void created;
      } catch (e) {
        setError(e instanceof Error ? e.message : "Save failed");
      }
    },
    [name, durationMin, startTime, avgHr, close, router],
  );

  if (!expanded) {
    return (
      <div className="mt-3">
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="text-xs text-[var(--color-text-muted)] transition duration-150 ease-out-strong hover:text-[var(--color-text)] active:scale-[0.98]"
        >
          + Log a workout
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="mt-3 space-y-3">
      <p className="text-xs font-medium uppercase tracking-[0.18em] text-[var(--color-text-muted)]">
        Log a workout
      </p>

      <div className="space-y-2">
        <Field label="Name">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Hyrox HIIT"
            maxLength={80}
            required
            autoFocus
            className={INPUT_CLS}
          />
        </Field>

        <div className="grid grid-cols-2 gap-2">
          <Field label="Duration (min)">
            <input
              type="number"
              inputMode="numeric"
              value={durationMin}
              onChange={(e) => setDurationMin(e.target.value)}
              placeholder="50"
              min={1}
              max={300}
              required
              className={INPUT_CLS}
            />
          </Field>
          <Field label="Started at">
            <input
              type="time"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
              required
              className={INPUT_CLS}
            />
          </Field>
        </div>

        <Field label="Avg HR (optional)">
          <input
            type="number"
            inputMode="numeric"
            value={avgHr}
            onChange={(e) => setAvgHr(e.target.value)}
            placeholder="158"
            min={30}
            max={230}
            className={INPUT_CLS}
          />
        </Field>
      </div>

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="bg-white/10 px-3 py-1.5 text-xs font-medium text-[var(--color-text)] transition duration-150 ease-out-strong hover:bg-white/20 active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {pending ? "Saving…" : "Save workout"}
        </button>
        <button
          type="button"
          onClick={close}
          disabled={pending}
          className="text-xs text-[var(--color-text-muted)] transition duration-150 ease-out-strong hover:text-[var(--color-text)] active:scale-[0.97]"
        >
          Cancel
        </button>
      </div>

      {error && <p className="text-xs text-[var(--color-red)]">{error}</p>}
    </form>
  );
}

const INPUT_CLS =
  "w-full border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-sm text-[var(--color-text)] placeholder:text-[var(--color-text-muted)] focus:border-[var(--color-text-muted)] focus:outline-none";

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs text-[var(--color-text-muted)]">
        {label}
      </span>
      {children}
    </label>
  );
}
