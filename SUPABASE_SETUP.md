# Supabase Setup + Migration Execution

_The hands-on steps to stand up Postgres and run the migration. Pairs with
`MIGRATION_RUNBOOK.md` (the why) — this is the exact what-to-click/what-to-type._

Free tier is plenty for now (one user, small data). You can upgrade later.

---

## Part A — Create the Supabase project (dashboard)

1. Go to supabase.com → sign in → **New project**.
2. Name it `baseline`. Pick the **region closest to you** (lower latency).
3. Set a **database password** — save it somewhere safe, you'll paste it into the
   connection strings. (You can reset it later under Settings → Database.)
4. Wait ~2 min for it to provision.

## Part B — Grab the two connection strings

Supabase → **Project Settings → Database → Connection string → "URI"**. You need
two forms (toggle the **Mode** / use the labelled ones):

- **Pooled** (Transaction mode, host has `pooler`, port **6543**) → this is `DATABASE_URL`.
  Append `?pgbouncer=true` to it.
- **Direct** (Session/direct, port **5432**) → this is `DIRECT_URL`.

Put both in your `.env`, password filled in:

```
# Postgres (Supabase) — replace the SQLite line, keep a copy of the old one commented
DATABASE_URL="postgresql://postgres.<ref>:<password>@<host>:6543/postgres?pgbouncer=true"
DIRECT_URL="postgresql://postgres.<ref>:<password>@<host>:5432/postgres"
```

> Keep your old `DATABASE_URL="file:./dev.db"` line commented out — you'll temporarily
> need it back for the dump step (Part D-1).

## Part C — One-time local prep

```bash
npm i -D tsx          # the scripts run with tsx; you don't have it yet
cp prisma/dev.db prisma/dev.db.bak   # rollback safety
```

---

## Part D — Run the migration (ORDER MATTERS)

The tricky bit: `DATABASE_URL` points at **SQLite** for step 1, then **Postgres** for
everything after. Don't flip it early.

**1. Dump — while still on SQLite.**
   Make sure `.env` `DATABASE_URL` is still the `file:./dev.db` line, current
   `schema.prisma` still says `provider = "sqlite"`.
```bash
npx tsx scripts/migration/migrate-counts.ts before   # writes counts.before.json
npx tsx scripts/migration/dump.ts                     # writes migration-dump/*.json
```

**2. Switch to Postgres.**
```bash
cp prisma/schema.draft.prisma prisma/schema.prisma    # adopt the multi-tenant schema
# now edit .env: comment the SQLite DATABASE_URL, uncomment the Supabase DATABASE_URL + DIRECT_URL
npx prisma migrate dev --name init_multitenant        # creates all tables in Supabase
npx prisma generate                                   # regenerate client for Postgres
```

**3. Load your data + baselines.**
```bash
npx tsx scripts/migration/load.ts
npx tsx scripts/migration/recompute-baselines.ts
```

**4. Verify — every count must match.**
```bash
npx tsx scripts/migration/migrate-counts.ts after     # writes counts.after.json
# diff them:
npx tsx -e "const b=require('./counts.before.json'),a=require('./counts.after.json');let bad=0;for(const k of new Set([...Object.keys(b),...Object.keys(a)])){if((b[k]||0)!==(a[k]||0)){bad++;console.log('MISMATCH',k,b[k],'->',a[k])}}console.log(bad?bad+' mismatches':'all counts match ✅')"
```
   (Note: `userProfile` may legitimately differ if the old Int-id row mapped 1→1; ignore a
   `userBaseline` entry — it's newly computed, not dumped.)

**5. Smoke-test.** Open Supabase → **Table Editor** and eyeball a few tables. Then, once
you've added the `getCurrentUserId()` shim + patched writes (Runbook Phase 6), run the app
locally against Postgres.

---

## What we are NOT doing yet (deferred, on purpose)

- **Row-Level Security** — enable in Supabase only after auth (roadmap Phase 2). Loads run
  as the service role and bypass RLS, so turning it on now just gets in your way.
- **The 305-query read sweep** — gradual, under RLS protection later.
- **Vercel deploy** — separate step once the app runs locally on Postgres.

## Rollback

Uncomment the SQLite `DATABASE_URL`, `git checkout prisma/schema.prisma`,
`npx prisma generate`. You're back on `dev.db`. Keep `dev.db.bak` for a few days.
