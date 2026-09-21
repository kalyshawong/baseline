"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Weekly run-volume landmarks (MEV / MAV / MRV, km). The desktop workout
 * card reads weekly km against these; with none set it shows plain km.
 * Kalysha's own numbers — nothing is suggested.
 */
export function RunLandmarksSettings({
  initial,
}: {
  initial: { runMevKm: number | null; runMavKm: number | null; runMrvKm: number | null };
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [mev, setMev] = useState(initial.runMevKm != null ? String(initial.runMevKm) : "");
  const [mav, setMav] = useState(initial.runMavKm != null ? String(initial.runMavKm) : "");
  const [mrv, setMrv] = useState(initial.runMrvKm != null ? String(initial.runMrvKm) : "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isSet = initial.runMevKm != null && initial.runMavKm != null && initial.runMrvKm != null;

  async function save(clear = false) {
    setSaving(true);
    setError(null);
    try {
      const body = clear
        ? { runMevKm: null, runMavKm: null, runMrvKm: null }
        : { runMevKm: Number(mev), runMavKm: Number(mav), runMrvKm: Number(mrv) };
      const res = await fetch("/api/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Save failed");
      setOpen(false);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="panel mt-[14px]">
      <div className="flex items-center justify-between">
        <div>
          <p className="ov">Weekly run volume · landmarks</p>
          <p className="mt-1 text-sm text-[var(--color-text-muted)]">
            {isSet
              ? `MEV ${initial.runMevKm} km · MAV ${initial.runMavKm} km · MRV ${initial.runMrvKm} km`
              : "Not set — the run card shows plain weekly km."}
          </p>
        </div>
        <button type="button" className="linklike" onClick={() => setOpen((o) => !o)}>
          {open ? "Close" : isSet ? "Edit" : "Set"}
        </button>
      </div>
      {open && (
        <div className="mt-4 grid grid-cols-3 gap-3">
          {(
            [
              ["MEV", mev, setMev],
              ["MAV", mav, setMav],
              ["MRV", mrv, setMrv],
            ] as const
          ).map(([label, val, set]) => (
            <label key={label} className="block">
              <span className="mb-1 block text-xs text-[var(--color-text-muted)]">{label} (km / week)</span>
              <input
                type="number"
                min={0}
                step={0.5}
                value={val}
                onChange={(e) => set(e.target.value)}
                className="field"
                inputMode="decimal"
              />
            </label>
          ))}
          <div className="col-span-3 flex items-center gap-3">
            <button type="button" className="btn" disabled={saving || !mev || !mav || !mrv} onClick={() => save()}>
              Save
            </button>
            {isSet && (
              <button type="button" className="btn btn-ghost" disabled={saving} onClick={() => save(true)}>
                Clear
              </button>
            )}
            {error && <span className="text-xs text-[var(--color-red)]">{error}</span>}
          </div>
        </div>
      )}
    </div>
  );
}
