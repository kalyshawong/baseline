# Baseline — Go-Public Roadmap

_Solo → friends → public. Drafted June 16, 2026 (~12 weeks of summer left)._

**The throughline: validate before you invest.** The trap with this kind of project is
spending the whole summer on the stuff that *feels* like "a real app" — Capacitor, Swift,
App Store review — before knowing anyone actually uses it. Each phase below ends with a
decision gate. Don't start the next phase's heavy work until you can answer its gate "yes."

**Stack decisions already made:**
- DB: **Postgres via Supabase** (gives Postgres + auth + row-level security in one place)
- Client: **PWA first**, then **Capacitor** wrapper for native HealthKit later
- AI: keep calling the **Anthropic API** (no model training, ever) — just on a business
  account with per-user metering
- Native HealthKit needs the **$99/yr Apple Developer account** — buy it only when you reach Phase 3

---

## Phase 0 — Foundation (you, now) · ~2 weeks

Goal: app deployed, reachable on your phone over cellular, data model already
multi-tenant-shaped. Nothing user-facing changes.

- Migrate SQLite → Postgres (Supabase). Establish a real Prisma migration workflow
  (there's no `migrations/` folder today — you've been on `db push`).
- Deploy backend to Vercel; move `.env` secrets to the host.
- Add a `User` table + `userId` on the core tables, **hardcoded to you**. Scope every
  query by `userId` now. No login UI yet — this is just the cheap insurance so multi-user
  later is "add a login screen," not "reshape the whole DB."
- Add PWA: manifest + icons + service worker → "Add to Home Screen," fullscreen.
- Kill your own sync tedium: point **Health Auto Export** at your `/sync` endpoint;
  turn on **Clue → Apple Health** so cycle data rides the same pipe.

**Deliverable:** you using Baseline as an installed app at the gym, all data flowing in
automatically, zero manual sync.
**Gate → Phase 1:** Is the PWA actually good enough on your phone, or do you immediately
hit a wall? (Almost certainly good enough.)

---

## Phase 1 — Workout mode + dogfood (you) · ~2–3 weeks

Goal: the gym surface works for *training*, not desk review.

- Dedicated **workout mode**: start session, timer, GPS for the runs (web Geolocation),
  tap-to-log stations/reps/weights. Big targets, sweaty-hands UX.
- **Offline logging**: queue locally, sync when signal returns (service worker + local
  store). Commercial gyms eat signal — this matters more than going native.
- Live with it for two weeks. Fix what annoys you. Cheapest user research you'll ever get.

**Gate → Phase 2:** Would you actually show this to a friend? Don't proceed until yes.

---

## Phase 2 — Multi-user for friends · ~3 weeks

Goal: a handful of training partners each get their own account + dashboard.

- **Auth** (Supabase Auth): login/signup. Flip `userId` from hardcoded → logged-in user.
- **Row-Level Security** in Postgres so users physically cannot read each other's data.
  Non-negotiable once you hold someone else's health data.
- **Per-user Oura**: replace the single global `OuraToken` with a per-user "Connect Oura"
  OAuth flow + per-user token refresh.
- **HealthKit for friends**: keep using Health Auto Export, hand-configured per person.
  Fine for 3–5 friends. Do **not** build native yet.
- **AI metering**: gate the coach behind auth, track per-user token usage, set a sane cap.
- **Privacy basics**: a real privacy policy + consent on signup — you now hold others' data.

**Gate → Phase 3:** Do friends use it *weekly*, unprompted? This is the real signal that
justifies the expensive native + App Store work.

---

## Phase 3 — Public / native app · ~4+ weeks, tails into fall

Goal: anyone can download and onboard themselves. The heavy, slow stuff lives here.

- Buy the **$99 Apple Developer account**.
- **Capacitor** wrap of the web app + **HealthKit plugin** → native HealthKit reading.
  This kills the export-app dependency that doesn't scale to strangers.
- **Self-serve onboarding**: connect Oura (OAuth), grant HealthKit (native prompt) — no
  manual setup for the user.
- **App Store submission** (see long-poles — health apps get stricter review).
- **Billing**: subscription (Stripe, or RevenueCat for in-app) so revenue covers AI token
  cost. Model your cost-per-user *before* setting a price.
- Android (Health Connect) is a separate integration — defer past launch.

---

## Long-poles — don't be surprised by these

- **App Store review for health apps is stricter & slower.** Needs a privacy-policy URL,
  a justification for HealthKit data use, no using health data for ads, and user-facing
  account deletion. Review alone can eat weeks.
- **Other people's health data is a real responsibility.** Encryption at rest (Supabase
  covers this), account deletion, explicit consent. Not HIPAA unless you become a covered
  entity, but it's sensitive PII regardless — treat it seriously.
- **Oura production API approval + rate limits** kick in beyond a few users. Apply early.
- **AI cost scales with users.** It's per-token, billed to your account — model it before pricing.
- **Apple takes ~15–30%** of in-app subscriptions. Factor it into the price.

---

## Timeline reality check

June 16 → early September ≈ 12 weeks. **Phases 0–2 are very doable solo this summer.**
Phase 3 (native + App Store + billing) realistically *starts* late summer and tails into
fall — App Store review by itself can take weeks. So an honest end-of-summer target is
**"friends using it weekly + the native app submitted for review,"** not "live on the App
Store for the public." That's the difference between a realistic summer and a burned one.
