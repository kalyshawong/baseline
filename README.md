# Baseline

**Find your own baseline. No clinic required.**

Your wearable already knows more about your body than an annual physical does — it just presents that data against population averages that were never about you. A 22 ms HRV reads as "poor" on every chart, and can still be *your* healthy set-point. Baseline exists to answer the only question that matters: **what's normal for you, and what actually moves it?**

That knowledge used to require a sports-science lab, a clinician, or a statistics degree. Baseline puts it in an app, in plain language, built from data you already collect.

## What it does

**Learns your baseline.** ~60 nights of your own wearable data become your personal reference ranges — HRV, resting heart rate, sleep, temperature, cycle rhythm. Every reading is judged against *you*, never against a population chart. Your low HRV is a set-point, not a deficit.

**Calls your training day.** One daily verdict — push, easy, or recover — computed from your physiology, with the reasoning shown. Cycle-aware, because cycle phase moves heart metrics as much as an alcoholic drink does and almost nothing else accounts for that.

**Finds patterns without lying to you.** The Findings feed only shows a pattern when it survives real statistics: 14+ days of evidence per side, detrending, cycle adjustment, false-discovery correction, and two independent tests that must agree. Below that bar you see an honest progress bar, not a fake insight. No card ever claims cause and effect — including the food→gut-distress analyzer that traces pre-run meals to GI failures.

**Runs real experiments on you.** Any pattern can become a randomized n-of-1 experiment: the app assigns your test/control days, schedules the start (so a bad streak recovering on its own can't fake a cure), sizes the test from your own variance — and **refuses to run it if it can't honestly detect an effect worth caring about**. Verdicts show two labeled numbers: what was measured and what you felt.

**Diagnoses bad stretches.** When your sessions degrade below your own baseline while you're trying just as hard, Baseline first checks what it already knows (cycle phase, illness signals, travel, sleep debt, overdue deload) — and only if nothing explains it, proposes isolating one suspected cause at a time with a randomized test. It learns what you will and won't do, and stops asking about the things you won't.

## What it deliberately isn't

No population percentiles as judgment. No "wellness score" theater. No correlation dressed up as causation. No advice a p-value can't back. When the honest answer is "not enough data," that's the answer on screen.

## Stack

Next.js 15 · Prisma · Postgres (Supabase) · native iOS shell (Capacitor + custom HealthKit background sync) · Oura API · Vercel

Private beta — invite only.
