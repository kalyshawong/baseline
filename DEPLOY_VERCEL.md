# Deploy to Vercel — step by step

_Gets Baseline live over cellular so the installed PWA works at the gym. Your
Supabase database is already migrated, so this is just hosting the app._

## Before you start

Your code has new files (multi-tenant schema, GI feature, PWA, middleware).
Commit and push so Vercel deploys the current state:

```bash
git add -A
git commit -m "Multi-tenant Postgres, meal->GI analyzer, PWA, access gate"
git push
```

A `postinstall: prisma generate` script was added to package.json — Vercel needs
that so it builds a fresh Prisma client every deploy (otherwise you get a stale-
client error). Nothing for you to do; just don't remove it.

## Step 1 — Import the project

1. Go to vercel.com → sign in with GitHub → **Add New… → Project**.
2. Pick the `kalyshawong/baseline` repo → **Import**.
3. Framework preset auto-detects **Next.js**. Leave build settings default.

## Step 2 — Environment variables (the important part)

Before clicking Deploy, expand **Environment Variables** and add these (copy the
values from your local `.env`). Set them for **Production** (and Preview if you
want preview deploys to work):

| Name | Value |
|---|---|
| `DATABASE_URL` | Supabase pooled URL (`...:6543/postgres?pgbouncer=true`) |
| `DIRECT_URL` | Supabase direct URL (`...:5432/postgres`) |
| `ANTHROPIC_API_KEY` | from `.env` |
| `OURA_CLIENT_ID` | from `.env` |
| `OURA_CLIENT_SECRET` | from `.env` |
| `SYNC_API_KEY` | from `.env` |
| `HEALTHKIT_SYNC_KEY` | from `.env` |
| `SITE_PASSWORD` | **pick a password** — this is the gate over your health data |
| `OURA_REDIRECT_URI` | `https://<your-vercel-domain>/api/auth/oura/callback` *(see Step 4)* |
| `NEXT_PUBLIC_APP_URL` | `https://<your-vercel-domain>` *(see Step 4)* |

> You won't know `<your-vercel-domain>` until after the first deploy. Put a
> placeholder for the last two now, deploy, then fix them in Step 4.

## Step 3 — Deploy

Click **Deploy**. First build takes a couple minutes. When it's done, Vercel
gives you a URL like `baseline-xxxx.vercel.app`.

## Step 4 — Fix the two URL vars (OAuth needs the real domain)

1. Copy your real Vercel domain.
2. Vercel → Project → **Settings → Environment Variables**: update
   `NEXT_PUBLIC_APP_URL` to `https://<domain>` and `OURA_REDIRECT_URI` to
   `https://<domain>/api/auth/oura/callback`.
3. In the **Oura developer dashboard** (cloud.ouraring.com → your OAuth app),
   add that same redirect URI to the allowed list — otherwise Oura refuses the
   login.
4. Vercel → **Deployments → ⋯ → Redeploy** so the new values take effect
   (`NEXT_PUBLIC_*` vars are baked in at build time, so a redeploy is required).

## Step 5 — Point Health Auto Export at production

In the Health Auto Export app, change your REST automation URL from the local
one to `https://<domain>/api/healthkit-sync`. (That endpoint is exempt from the
password gate — it authenticates with `HEALTHKIT_SYNC_KEY` — so syncs keep working.)

## Step 6 — Install it on your phone

1. On your iPhone, open `https://<domain>` in **Safari**.
2. It'll prompt for the password (`SITE_PASSWORD`). Enter it.
3. **Share → Add to Home Screen.** It installs as "Baseline" with the gold icon,
   opens fullscreen, no browser chrome. That's your gym app.

---

## Notes

- **The password gate is interim.** When real auth lands (Phase 2), remove
  `SITE_PASSWORD` and the gate turns off automatically. Until then it's the only
  thing between the public URL and your health data — don't deploy without it.
- **Database is already migrated.** Vercel uses the same Supabase DB you migrated,
  so there's no migrate step in the deploy. Future schema changes: run
  `npx prisma migrate deploy` against the Supabase DB, then push.
- **Costs:** Vercel Hobby (free) and Supabase free tier cover a single user fine.
