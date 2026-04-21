"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

interface TodayResponse {
  planId: string;
  goalId: string;
  raceDate: string;
  recommendation: {
    sessionType: string;
    title: string;
    block: string;
    weekInBlock: number;
    daysToRace: number;
  };
}

const SESSION_TYPE_LABELS: Record<string, string> = {
  easy_run: "Easy Run",
  tempo: "Tempo",
  intervals: "Intervals",
  long_run: "Long Run",
  strength: "Strength",
  compromised: "Compromised",
  station_work: "Station Work",
  recovery: "Recovery",
  race_simulation: "Race Sim",
};

export function HyroxSummaryCard() {
  const [data, setData] = useState<TodayResponse | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const res = await fetch("/api/hyrox/today");
        if (!res.ok) return;
        const json = (await res.json()) as TodayResponse;
        if (!cancelled) setData(json);
      } catch {
        // No active plan — hide card
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!data) return null;

  const rec = data.recommendation;

  return (
    <Link
      href="/body/hyrox"
      className="block rounded-xl border border-amber-500/30 bg-[var(--color-surface)] p-4 transition-colors hover:border-amber-500/50"
    >
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="rounded-full bg-amber-500/20 px-2 py-0.5 text-[10px] font-medium uppercase text-amber-400">
              hyrox
            </span>
            <span className="text-sm font-medium">Hyrox Race Plan</span>
          </div>
          <div className="flex items-center gap-2 text-xs text-[var(--color-text-muted)]">
            <span>{rec.daysToRace}d to race</span>
            <span className="opacity-50">|</span>
            <span className="capitalize">{rec.block} wk{rec.weekInBlock}</span>
            <span className="opacity-50">|</span>
            <span>
              Today:{" "}
              {SESSION_TYPE_LABELS[rec.sessionType] ?? rec.sessionType}
            </span>
          </div>
        </div>
        <span className="text-xs text-amber-400">View plan &rarr;</span>
      </div>
    </Link>
  );
}
