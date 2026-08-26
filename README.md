# Baseline

Baseline is an app that finds your personal baseline from your own wearable data.

## Why this exists

Baseline started because my own wearables kept telling me things about my body that weren't true.

My overnight HRV averages around 20ms. Every chart says that's terrible. Every app flagged me as overtrained, every single day, and told me to take it easy — permanently. But it's not a problem, it's just my number: my HRV tracks my heart rate exactly the way it should, it's simply low. The apps were comparing me to a population average instead of to me, and there was no way to tell them otherwise.

Then I threw up twice during a race because of what I ate beforehand, and none of my data could tell me which part of the meal did it, or help me test it.

The information I needed — what's my actual normal, what actually affects my performance — exists. Sports labs measure it. Clinicians can work it out. But normal people don't have access to that, even though our watches and rings are already collecting the raw data every night. So I built the thing that does it: it learns your baseline from your own data, compares you only to yourself, and when it spots something suspicious, it helps you test it properly instead of guessing.

Right now, if you want to know what's actually normal for your body — your real resting heart rate, your real HRV range, how your cycle moves things, what your sleep actually does to your training — you'd need a sports lab or a clinic, and even then they'd mostly compare you to population averages. Baseline does it from data your watch and ring already collect, and explains it in normal language.

The point: an HRV of 22ms is "poor" on every chart on the internet. It can also just be your number. You can't know which until something measures *you* against *you*. That's what this is.

## What it actually does

**Finds your baseline.** After about 60 nights of data it knows your normal ranges for HRV, resting heart rate, sleep, and temperature. Everything after that is compared to your own numbers, not a chart.

**Tells you what kind of training day it is.** One call each morning — push, easy, or recover — based on your body, including your cycle phase, with the reasoning written out.

**Notices patterns without making things up.** It watches for things like "you sleep worse after late caffeine" or "these pre-run meals keep wrecking your stomach" — but it only shows a pattern when there's actually enough data to say it (14+ days per side, corrected for the statistical traps that make most app "insights" fake). Until then it just shows a progress bar.

**Lets you test things on yourself properly.** Any pattern can become a real experiment: the app picks which days are test days and which are control days (so you can't fool yourself), schedules it, and sizes it from your own data. If a test can't actually detect anything meaningful, it tells you that and refuses to run — instead of running anyway and handing you noise.

**Figures out why you're suddenly worse.** If your sessions drop below your normal while you're trying just as hard, it first checks the boring explanations — cycle phase, getting sick, travel, sleep debt, needing a deload. Only if none of those fit does it start testing suspects, one at a time.

## What it doesn't do

It doesn't score your "wellness." It doesn't compare you to other people. It doesn't tell you a correlation is a cause. And when the honest answer is "not enough data yet," that's what it says.

## Stack

Next.js 15 · Prisma · Postgres (Supabase) · Capacitor iOS shell with custom HealthKit background sync · Oura API · Vercel

Currently invite-only.
