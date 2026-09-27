"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export interface GarminCardData {
  day: string; // YYYY-MM-DD
  bodyBatteryHigh: number | null;
  bodyBatteryLow: number | null;
  bodyBatteryCharged: number | null;
  bodyBatteryDrained: number | null;
  trainingStatus: string | null;
  acuteLoad: number | null;
  chronicLoad: number | null;
  acwr: number | null;
  trainingReadiness: number | null;
  readinessLevel: string | null;
  hrvLastNight: number | null;
  hrvWeeklyAvg: number | null;
  hrvStatus: string | null;
  sleepScore: number | null;
  stressAvg: number | null;
  restingHr: number | null;
  vo2Max: number | null;
}

const dash = (v: number | string | null | undefined, suffix = "") => (v == null ? "—" : `${v}${suffix}`);

/**
 * Garmin's own computed numbers, shown next to Baseline's (plain; Kalysha
 * restyles). Display-only context: Body Battery, Training Load/Status,
 * HRV Status and Readiness are Garmin's models, not ours, and never feed
 * an experiment verdict.
 */
export function GarminCard({ data, linked, lastSyncAt, lastError }: { data: GarminCardData | null; linked: boolean; lastSyncAt: string | null; lastError: string | null }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const sync = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const r = await fetch("/api/garmin/sync", { method: "POST" });
      const j = (await r.json()) as { ok?: boolean; days?: number; errors?: string[]; error?: string };
      setMsg(j.ok ? `Synced ${j.days} days${j.errors?.length ? ` · ${j.errors.length} day(s) had gaps` : ""}` : (j.error ?? "Sync failed"));
      router.refresh();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Sync failed");
    } finally {
      setBusy(false);
    }
  };

  if (!linked) {
    return (
      <div className="panel">
        <div className="ov">Garmin</div>
        <p className="mt-2 text-sm text-[var(--color-text-muted)]">
          Body Battery, Training Load and HRV Status live inside Garmin Connect and don&apos;t reach Apple Health. Ask Kalysha to link your Garmin account to see them here.
        </p>
      </div>
    );
  }

  return (
    <div className="panel">
      <div className="flex items-baseline justify-between gap-3">
        <div className="ov">Garmin · {data ? data.day : "no data yet"}</div>
        <button type="button" className="btn-ghost text-xs" onClick={() => void sync()} disabled={busy}>
          {busy ? "Syncing…" : "Sync Garmin"}
        </button>
      </div>
      {data ? (
        <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3 text-sm sm:grid-cols-3">
          <Stat label="Body Battery" value={data.bodyBatteryHigh != null ? `${data.bodyBatteryLow ?? "—"}–${data.bodyBatteryHigh}` : "—"} detail={data.bodyBatteryCharged != null ? `+${data.bodyBatteryCharged} / −${data.bodyBatteryDrained ?? 0}` : undefined} />
          <Stat label="Training readiness" value={dash(data.trainingReadiness)} detail={data.readinessLevel ?? undefined} />
          <Stat label="Training status" value={data.trainingStatus ?? "—"} />
          <Stat label="Load (acute / chronic)" value={data.acuteLoad != null ? `${Math.round(data.acuteLoad)} / ${data.chronicLoad != null ? Math.round(data.chronicLoad) : "—"}` : "—"} detail={data.acwr != null ? `ratio ${data.acwr.toFixed(2)}` : undefined} />
          <Stat label="HRV status" value={data.hrvStatus ?? "—"} detail={data.hrvLastNight != null ? `last night ${data.hrvLastNight} ms · 7-day ${dash(data.hrvWeeklyAvg, " ms")}` : undefined} />
          <Stat label="Sleep score" value={dash(data.sleepScore)} />
          <Stat label="Resting HR" value={dash(data.restingHr, " bpm")} />
          <Stat label="Stress (avg)" value={dash(data.stressAvg)} />
          <Stat label="VO₂ max" value={dash(data.vo2Max)} />
        </div>
      ) : (
        <p className="mt-2 text-sm text-[var(--color-text-muted)]">Linked. Tap Sync Garmin to pull the last two weeks.</p>
      )}
      <p className="mt-3 text-xs text-[var(--color-text-muted)]">
        {lastSyncAt ? `Last pulled ${new Date(lastSyncAt).toLocaleString()}` : "Never pulled"}
        {lastError ? ` · last run had gaps: ${lastError.slice(0, 160)}` : ""}
        {msg ? ` · ${msg}` : ""}
      </p>
      <p className="mt-1 text-[11px] text-[var(--color-faint)]">Garmin&apos;s own models, shown for context. Baseline&apos;s verdicts use your recorded nights and sessions, not these scores.</p>
    </div>
  );
}

function Stat({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return (
    <div>
      <div className="text-[10.5px] uppercase tracking-wider text-[var(--color-faint)]">{label}</div>
      <div className="mt-0.5 font-semibold">{value}</div>
      {detail ? <div className="text-xs text-[var(--color-text-muted)]">{detail}</div> : null}
    </div>
  );
}
