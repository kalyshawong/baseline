# Baseline Roadmap — August 2026

**Author:** Kalysha (with Claude)
**Status:** Active
**Supersedes:** the "eventually wrap in Capacitor" framing in `healthkit-sync-spec.md` and the moat framing in `competitive-analysis.md`

---

## 1. The strategic reset: generic AI + Health access changed the game

ChatGPT (and any assistant) with Apple Health access can now: answer questions about
your health data, eyeball correlations, give competent training advice, estimate
macros. That commoditizes every Baseline surface whose value is "smart words about my
health data" — most of the Coach tab and dashboards-as-explanation. The old positioning
("no single system connects biometrics + training + cycle + experiments") is no longer
a moat by itself, because a chat window with Health access *is* a single system, free,
zero setup.

### What a generic assistant structurally cannot do — the actual moats

1. **Deterministic, calibrated daily verdict.** The training call is computed from
   rules tuned to *this user's* physiology (personal HRV CV baseline, cycle offsets).
   Same inputs → same answer, auditable, glanceable in 2 seconds. Nobody re-prompts a
   chatbot every morning and trusts a hallucinatable answer about whether to lift
   heavy. **The habit surface is a score, not a conversation.**
2. **Structured n=1 experimentation.** Protocol enforcement over weeks — treatment/
   control logging, Welch's/Fisher's with real n's. Produced the meal→GI vomiting
   finding (May 2026) that no chat memory would have caught. LLM memory is vibes; the
   experiment engine is receipts.
3. **Proactive push.** Assistants wait to be asked. Baseline can push "EASY day — cut
   volume 20%" before the user asks. Pull vs push is a behavioral moat.
4. **Cycle-aware programming for women who lift.** Underserved; generic assistants
   don't track it and won't proactively downgrade a training day because of it.
5. **Longitudinal owned data across sources** (Oura + Watch + meals + sets) with
   per-user learned baselines. The substrate everything above needs.

### Consequence

The **chat coach is demoted from centerpiece to lens.** It's the most replaceable
surface in the app; its only defensible value is sitting on top of moats 1–5. Do not
invest further in chat UX beyond keeping it functional.

---

## 2. Keep / cut

**Keep and sharpen**
- Baseline Score + Today's Call — eventually a push notification / lock-screen widget;
  this is the moat surface
- Mind Mode experiments + passive insights (stats engine)
- Personal-baseline calibration (HRV CV vs population thresholds)
- Cycle-phase logic (temp offsets, training guidance, ACL flag)
- Meal→GI analyzer (proof-case for the whole thesis)

**Cut / freeze**
- Arduino env sensor + bar-velocity IMU tracks — solo-hacker projects that don't
  survive multi-user; freeze indefinitely
- Research-citation chips on dashboard cards (already ruled: cards are data-only;
  coaching context lives in the coach surface)
- Hyrox hardcoding — Baseline is goal-agnostic; race prep becomes a **goal template**,
  not a module
- Further chat-coach investment

---

## 3. Multi-user reality check (blunt)

The app today is **not shippable to friends** regardless of features:

- Auth is one shared `SITE_PASSWORD` over HTTP Basic Auth
- `getCurrentUserId()` returns a hardcoded string (`usr_kalysha`)
- One Oura token for the whole deployment
- Free-tier Supabase pauses after ~7 idle days (took prod down Aug 15–16)
- No onboarding, no cold-start story for the ~1-month learning period

"Other people can use it" is gated on: real auth (Supabase Auth or NextAuth), per-user
Oura OAuth, onboarding + learning-period UX, and a database that stays awake (paid tier
~$25/mo or keep-alive cron). None of it is glamorous. All of it is the actual work.

---

## 4. Apple Health ingestion decision

**Health Auto Export is disqualified** for anything beyond solo use: a $5 third-party
app + webhook-URL configuration is a conversion funnel that ends at zero.

Options considered:

| Option | Verdict |
|---|---|
| **Capacitor wrap + native HealthKit background delivery** | **Chosen.** Onboarding becomes "Allow Health access" → background sync forever. Reuses the existing `/api/healthkit-sync` endpoint. Unlocks TestFlight distribution. |
| Tiny native sync-only companion app | Backup if full wrap hits friction; two-app UX confuses exactly the users we want |
| iOS Shortcuts → webhook | Free but limited data types, unreliable; dead end |
| Aggregators (Terra/Vital/Spike) | Don't remove the native requirement for HealthKit; per-user fees. Revisit only to add Garmin/Fitbit/Whoop later |

Key insight: the $99/yr Apple Developer account is **both** the data fix (HealthKit)
and the distribution fix (TestFlight, up to 10k external testers) in one purchase. It
is now urgent, not eventual.

---

## 5. Sequence

1. **Native wrap (now).** Apple Developer enrollment → Capacitor wrap of the deployed
   app → native HealthKit module with `HKObserverQuery` + `enableBackgroundDelivery`
   POSTing to `/api/healthkit-sync`. Kills Health Auto Export. See
   `docs/capacitor-healthkit-setup.md`.
2. **Multi-user foundation.** Real auth, per-user Oura OAuth, onboarding + cold-start
   UX, paid/kept-alive Supabase. Remove `SITE_PASSWORD` gate once real auth lands.
3. **TestFlight to training partners.** First non-Kalysha users; instrument what
   confuses them.
4. **Moat sharpening.** Morning push notification of the Call; experiment templates
   polish; goal templates (Hyrox becomes one); quietly stop investing in chat.

**Vercel's role does not change.** The native app is a shell over the same deployed
Next.js app; Vercel remains backend + UI host for web, PWA, and native alike.
