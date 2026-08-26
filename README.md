# Baseline

Baseline is an app that finds your own personal baseline from your wearable data.

I built it to understand my own body and to improve. We get so much data from Oura and Apple Watch, but on its own it doesn't mean anything. We don't understand it and we can't learn from it.

My wearables also kept telling me things that weren't true. My overnight HRV averages around 20ms, which every chart on the internet says is terrible. Every app decided I was overtrained and told me to take it easy, every single day, forever. The real story is that my HRV is just low. It tracks my heart rate the way it should, so nothing is wrong with me. The apps were comparing me to a population average instead of to my own history, and there was no way to tell them that.

Then I threw up twice during a race because of something I ate beforehand, and none of my data could tell me which food did it or help me test it.

A sports lab or a clinic can answer questions like these, but most people never get access to one, even though a watch or ring is already collecting the raw data every night. Baseline learns what normal looks like for you from your own data, compares you only to yourself, and helps you run honest tests on yourself when something looks off.

## What it does

After about 60 nights of data it knows your normal ranges for HRV, resting heart rate, sleep, and temperature. From then on everything is compared to your own numbers instead of a chart.

Each morning it makes one training call (push, easy, or recover) based on your body, including your cycle phase, with the reasoning written out.

It watches for patterns like "you sleep worse after late caffeine" or "these pre-run meals keep wrecking your stomach", and it only shows a pattern once there is enough data to back it up: at least 14 days on each side, with corrections for the statistical traps that make most app insights fake. Before that it just shows a progress bar.

Any pattern can become a real experiment. The app picks which days are test days and which are control days so you can't fool yourself, schedules the run, and sizes it from your own variance. If a test is too small to detect anything meaningful, it tells you that and refuses to run.

If your sessions drop below your normal while you're trying just as hard, it checks the boring explanations first (cycle phase, getting sick, travel, sleep debt, needing a deload) and only starts testing other suspects when none of those fit.

## What it doesn't do

There is no wellness score. It never compares you to other people, and it won't call a correlation a cause. When there isn't enough data to say something, it says that.

## Stack

Next.js 15, Prisma, Postgres (Supabase), Capacitor iOS shell with custom HealthKit background sync, Oura API, Vercel.

Currently invite-only.
