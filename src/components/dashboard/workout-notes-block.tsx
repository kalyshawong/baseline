"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * Notes attached to a synced workout. The deeper "explain why this
 * workout went the way it did" loop lives on /coach (Discuss with
 * coach → from WorkoutCard) — this component owns ONLY narrative
 * capture and signal-snapshot freezing.
 *
 * History worth knowing (2026-05-27): originally this component also
 * housed an inline Analyze button that ran a one-shot AI analysis.
 * We dropped it because:
 *   - the one-shot was capped at ~150 words, which boxed in the
 *     analysis; the conversational path can go ~10× deeper, ask
 *     follow-ups, and push back on the user's framing
 *   - having two AI paths (Analyze button AND Discuss with coach)
 *     duplicated UI and split the user's attention
 *   - the user's actual goal was always "give me context to explain
 *     why this happened" — conversation serves that better than a
 *     fixed-length paragraph
 * The /api/workout-notes/[id]/analyze endpoint still exists, just
 * unused — easy to revive if we ever want a quick one-shot back.
 *
 * Behavior:
 *   1. On mount, fetch any existing note for (source, workoutId).
 *   2. If none, show a "+ Add notes" trigger that expands into a
 *      textarea on click.
 *   3. Save (POST) creates the note and freezes a signal snapshot.
 *   4. Subsequent edits PATCH the note + re-capture the snapshot.
 *   5. Once saved, the WorkoutCard's "Discuss with coach →" button
 *      picks up the narrative + snapshot automatically.
 */

interface WorkoutNoteData {
  id: string;
  workoutSource: string;
  workoutId: string;
  narrative: string;
  /** Reserved for future use (unused in UI as of 2026-05-27 — see header comment). */
  analysis: string | null;
  createdAt: string;
  updatedAt: string;
}

interface Props {
  source: "healthkit" | "oura";
  workoutId: string;
}

type LoadState = "loading" | "ready";

export function WorkoutNotesBlock({ source, workoutId }: Props) {
  const [load, setLoad] = useState<LoadState>("loading");
  const [note, setNote] = useState<WorkoutNoteData | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch any existing note on mount.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(
          `/api/workout-notes?source=${source}&workoutId=${encodeURIComponent(workoutId)}`,
        );
        if (cancelled) return;
        if (res.ok) {
          const data: WorkoutNoteData = await res.json();
          setNote(data);
          setDraft(data.narrative);
        }
      } catch {
        // Network failure — treat as no note; user can still try to create.
      } finally {
        if (!cancelled) setLoad("ready");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [source, workoutId]);

  const save = useCallback(async () => {
    const trimmed = draft.trim();
    if (!trimmed) return;
    setSaving(true);
    setError(null);
    try {
      const url = note
        ? `/api/workout-notes/${note.id}`
        : "/api/workout-notes";
      const method = note ? "PATCH" : "POST";
      const body = note
        ? { narrative: trimmed }
        : { source, workoutId, narrative: trimmed };

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? `Save failed (${res.status})`);
      }

      const saved: WorkoutNoteData = await res.json();
      setNote(saved);
      setDraft(saved.narrative);
      setExpanded(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }, [draft, note, source, workoutId]);

  if (load === "loading") {
    // Render nothing while loading rather than flash an "Add notes"
    // affordance that immediately disappears if there's an existing note.
    return null;
  }

  // Empty state — no note yet. Show a single-line trigger that expands
  // into the textarea on click.
  if (!note && !expanded) {
    return (
      <div className="mt-3 border-t border-[var(--color-border)] pt-3">
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="text-xs text-[var(--color-text-muted)] transition duration-150 ease-out-strong hover:text-[var(--color-text)] active:scale-[0.98]"
        >
          + Add notes
        </button>
      </div>
    );
  }

  // Editor / saved view.
  const isEditing = expanded || !note;

  return (
    <div className="mt-3 space-y-2 border-t border-[var(--color-border)] pt-3">
      <p className="text-xs font-medium uppercase tracking-[0.18em] text-[var(--color-text-muted)]">
        Notes
      </p>

      {isEditing ? (
        <>
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="e.g. 5pm steak. started workout 8:33. yakked 35min in. max 5mph on treadmill."
            rows={4}
            className="w-full resize-y border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-sm leading-relaxed text-[var(--color-text)] placeholder:text-[var(--color-text-muted)] focus:border-[var(--color-text-muted)] focus:outline-none"
            autoFocus={!note}
            maxLength={4_000}
          />
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={save}
              disabled={saving || draft.trim().length === 0}
              className="bg-white/10 px-3 py-1.5 text-xs font-medium text-[var(--color-text)] transition duration-150 ease-out-strong hover:bg-white/20 active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {saving ? "Saving…" : note ? "Save changes" : "Save"}
            </button>
            {note && (
              <button
                type="button"
                onClick={() => {
                  setExpanded(false);
                  setDraft(note.narrative);
                  setError(null);
                }}
                disabled={saving}
                className="text-xs text-[var(--color-text-muted)] transition duration-150 ease-out-strong hover:text-[var(--color-text)] active:scale-[0.97]"
              >
                Cancel
              </button>
            )}
          </div>
        </>
      ) : (
        <>
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-[var(--color-text)]">
            {note?.narrative}
          </p>
          <button
            type="button"
            onClick={() => setExpanded(true)}
            className="text-xs text-[var(--color-text-muted)] transition duration-150 ease-out-strong hover:text-[var(--color-text)] active:scale-[0.97]"
          >
            Edit
          </button>
        </>
      )}

      {error && (
        <p className="text-xs text-[var(--color-red)]">{error}</p>
      )}
    </div>
  );
}
