"use client";

import { useState } from "react";
import Link from "next/link";
import type { ClientPlanProposal } from "@/lib/plan-proposal-marker";

/**
 * Plan card in a coach reply, with Save (2026-10-19). Every number here was
 * computed by the plan engine on the server; Save re-fetches foods from USDA.
 * Plain placeholder styling — Kalysha to design.
 */
export function PlanProposalCard({ p }: { p: ClientPlanProposal }) {
  const [state, setState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [err, setErr] = useState<string | null>(null);
  const v = p.preview;
  const fmt = (d: string | null) => (d ? new Date(`${d}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" }) : null);
  const lb = (kg: number) => `${(kg * 2.20462).toFixed(1)} lb`;

  async function save() {
    setState("saving");
    setErr(null);
    const res = await fetch(`/api/goals/${p.goalId}/plan/saved`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ raw: p.raw, summary: p.summary }),
    });
    if (res.ok) setState("saved");
    else {
      setState("error");
      setErr((await res.json().catch(() => ({}))).error ?? "Couldn't save");
    }
  }

  const row = (k: string, val: React.ReactNode) => (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 10, fontSize: 13, padding: "3px 0" }}>
      <span style={{ opacity: 0.7 }}>{k}</span>
      <span style={{ fontWeight: 600, textAlign: "right" }}>{val}</span>
    </div>
  );

  return (
    <div style={{ marginTop: 10, padding: 14, border: "1px solid var(--color-border, rgba(255,255,255,.15))" }}>
      <div style={{ fontSize: 11, letterSpacing: ".08em", textTransform: "uppercase", opacity: 0.7 }}>Plan · {p.goalTitle}</div>
      <div style={{ fontSize: 13.5, marginTop: 4 }}>{p.summary}</div>
      <div style={{ marginTop: 8 }}>
        {v.kcal != null && row("Calories", `${v.kcal.toLocaleString()} kcal`)}
        {v.proteinG != null && row("Protein · fat · carbs", `${v.proteinG} g · ${v.fatG} g · ${v.carbsG} g`)}
        {v.waterRestL != null && row("Water rest / training", `${v.waterRestL} L / ${v.waterTrainingL} L`)}
        {v.exercisePerDayKcal != null && row("Planned training", `~${v.exercisePerDayKcal} kcal/day`)}
        {v.deadline && row("Your date", fmt(v.deadline))}
        {v.projectedDate && v.projectedDate !== v.deadline && row("Projected", fmt(v.projectedDate))}
        {v.atDeadline && row("On your date", `${lb(v.atDeadline.weightKg)}${v.atDeadline.bodyFatPct != null ? ` · ${v.atDeadline.bodyFatPct.toFixed(1)}% BF` : ""}`)}
      </div>
      {v.menu.length > 0 && (
        <div style={{ marginTop: 8, fontSize: 12.5 }}>
          {v.menu.map((m, i) => (
            <div key={i} style={{ padding: "2px 0" }}>
              {m.label} — {m.kcal} kcal, {m.protein} g P <span style={{ opacity: 0.6 }}>({m.source})</span>
            </div>
          ))}
        </div>
      )}
      {v.warnings.length > 0 && (
        <div style={{ marginTop: 8, fontSize: 12.5 }}>
          {v.warnings.map((w, i) => <p key={i} style={{ marginTop: 4 }}>⚠︎ {w}</p>)}
        </div>
      )}
      <div style={{ display: "flex", gap: 12, alignItems: "center", marginTop: 10 }}>
        {state === "saved" ? (
          <Link href={`/goals/${p.goalId}/plan`} style={{ fontSize: 13, textDecoration: "underline" }}>Saved — open plan</Link>
        ) : (
          <button type="button" onClick={save} disabled={state === "saving"} style={{ padding: "8px 16px", fontSize: 13, fontWeight: 700 }}>
            {state === "saving" ? "Saving…" : "Save plan"}
          </button>
        )}
        {err && <span style={{ fontSize: 12, color: "var(--red, #e55)" }}>{err}</span>}
      </div>
    </div>
  );
}
