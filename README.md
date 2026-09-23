# splitmate.

**Workout Planner & Tracker.** A phone-first web app for planning training splits and logging workouts, with your previous sets beside today's inputs.

- Create named training splits, each with workouts, and exercises with targets.
- Activate one split at a time and keep a history of when each split was active.
- Log sets quickly, seeing what you did last time. A set only counts once you confirm it.
- Exercise history belongs to **you and the exercise**, not to a split or workout. Change splits freely; history follows the exercise.
- Share a split with a friend as a snapshot. They copy it and see their own history, never yours.

Built with Next.js 16 (App Router), TypeScript, Tailwind CSS 4 and Supabase (Auth and Postgres). It is designed to be deployed on Vercel.

---

## Quick start (local)

Requirements: Node 20.9+, Docker (for the local Supabase stack).

```bash
npm install
npm run db:start          # starts local Supabase, applies migrations, loads the demo seed
cp .env.example .env.local
npx supabase status       # copy API URL and Publishable key into .env.local
npm run dev               # http://localhost:3000
```

Local demo account (created only by `supabase/seed.sql`, **local only**):

| Email | Password |
|---|---|
| `demo@splitmate.test` | `splitmate-demo` |

It contains one real reference workout (Chest & back, 21 September 2026) and two splits. Nothing else is invented, and new accounts start empty.

### Scripts

| Command | What it does |
|---|---|
| `npm run dev` / `build` / `start` | Next.js |
| `npm run lint` / `typecheck` | ESLint / TypeScript |
| `npm run test:unit` | Pure logic: previous-set matching, session edits, sync engine, storage isolation, timer, formatting |
| `npm run test:db` | Migrations, functions and RLS against the local database (needs `db:start`) |
| `npm run test:e2e` | Playwright against a production build and local Supabase (run `npm run build` first) |
| `npm run db:reset` | Re-apply all migrations and the local seed |
| `npm run icons` | Regenerate PWA icons |

---

## Supabase setup (hosted)

The app needs **no service-role key**. All data access runs as the signed-in user under Row Level Security.

1. Create a **dedicated** Supabase project for Splitmate. Do not reuse another product's project, because the migrations create tables in `public`.
2. Link and push the migrations:
   ```bash
   npx supabase login
   npx supabase link --project-ref <your-project-ref>
   npx supabase db push        # applies supabase/migrations/*, including the exercise catalogue
   ```
   `db push` does **not** run `supabase/seed.sql`, so no demo data reaches production.
3. **Authentication → URL configuration**
   - Site URL: `https://<your-domain>`
   - Redirect URLs: `https://<your-domain>/auth/confirm` (add your Vercel preview pattern too, e.g. `https://*-<team>.vercel.app/auth/confirm`).
4. **Authentication → Providers → Email**: keep email + password enabled. With "Confirm email" on (recommended), the default confirmation email works as is: it lands on `/auth/confirm`, which handles both the PKCE `code` and the `token_hash` link formats.
5. **Project settings → API keys**: copy the Project URL and the **Publishable** key (or the legacy anon key).

### Environment variables

See `.env.example`:

| Name | Value |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://<project-ref>.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Publishable (`sb_publishable_…`) or anon key |

## Deploying to Vercel

1. Import the repository in Vercel (framework preset: Next.js; defaults are fine).
2. Add the two environment variables above for Production and Preview.
3. Deploy, then add the production domain to Supabase's Site URL and redirect URLs (step 3 above).

> Status: deployment has **not** been performed or verified from this repository yet. No Vercel or Supabase project credentials were available while it was built. Everything was verified against a local Supabase stack.

---

## How it works

### Data model

```
user ─┬─ splits ── workout_templates ── template_exercises ──> exercises
      ├─ split_active_periods (one open at most, no overlaps)
      ├─ workout_sessions ── session_exercises ──> exercises
      │                        └─ session_sets (confirmed = performed)
      └─ split_shares (token + frozen snapshot)
```

- **History is keyed by `(user_id, exercise_id)`.** "Previous performance" is the most recent *completed* session containing the exercise, across all splits and workouts. It is never mixed across days and never taken from unfinished sessions (`previous_performance()`).
- **Sessions are snapshots.** Starting a workout copies names and targets into the session. Editing, renaming or deleting a template (or split) never changes completed sessions. Source references become `NULL` instead of cascading.
- **Ownership is structural.** Child rows reference parents through composite `(id, user_id)` foreign keys, so a user cannot attach rows to someone else's split, template or session even by submitting their ids. Exercises used in templates and sessions must be catalogue exercises or the user's own (trigger `assert_exercise_usable`).
- **Activation** (`activate_split`) is transactional and serialised per user. It closes the open period and opens a new one; re-activating the current split is a no-op. A partial unique index enforces a single open period, and a `btree_gist` exclusion constraint forbids overlapping periods, including via date corrections.
- **Catalogue**: 89 curated exercises with ids derived from their slug (`md5('splitmate.catalogue:'||slug)`). They are stable across environments and re-running the migration is safe. Genuinely different variations (barbell, dumbbell, machine…) are separate exercises.
- **Tracking modes**: `weight_reps`, `bodyweight_reps` (reps only) and `added_weight_reps` (e.g. weighted dips; shown as `+10 × 10`, and `0` means bodyweight).

### Custom exercises and sharing

- Custom exercises are private rows owned by their creator. Users can add a **variant** (e.g. a specific gym's machine) so that similar machines keep separate histories instead of being silently merged.
- A share link exposes a **snapshot**: split name, shared description, workouts, exercises and targets, and template notes only if the owner opts in. It never includes weights, reps, history, session notes, activation dates or profile details. The owner sees an exact preview before creating the link, can **update the snapshot** explicitly, and can **revoke** it. Revoking does not affect copies already made.
- Catalogue exercises keep their canonical ids in the snapshot, so a recipient's own history appears immediately.
- Custom exercises are shared as **definitions** (name, variant, muscle, equipment, tracking mode) plus an opaque reference. When copying, each one becomes a **new custom exercise owned by the recipient**, with empty history, unless the recipient **explicitly picks** one of their existing exercises instead. Similar names are only suggested, never auto-matched. Copies record the reference so a later copy of the same exercise can be suggested.
- `get_shared_split(token)` and `copy_shared_split(token, choices)` are the only `SECURITY DEFINER` entry points. The token is 192 bits of randomness, and having it grants nothing beyond that snapshot.

### Logging, autosave and poor connectivity

- Every edit is written immediately to `localStorage`, namespaced by the authenticated user id, then synced to the server after an 800 ms debounce through `sync_session()`.
- **Idempotent writes**: each write carries a write id. If the outcome is unknown (offline, timeout, 5xx), the *identical* write is re-sent before anything newer, and the pending write is persisted with the record, so retries after a reload or reconnect apply exactly once.
- **Conflicts** (another tab or device changed the same workout) use optimistic concurrency on a server revision. A stale write is rejected and the logger asks which version to keep; nothing is overwritten silently. Tabs in the same browser follow each other's edits via `storage` events.
- **Discarded sessions cannot be resurrected** by late writes; finishing is idempotent; there can be only one in-progress session per user.
- The status badge says **Saved** only after the server confirms. Otherwise it shows Saving, Offline · on this device, Needs review, or Sync failed · Retry.
- Only confirmed sets count. Prefilled weights and placeholder reps are drafts; finishing removes all unconfirmed rows, and a workout with no confirmed sets can only be continued or discarded.
- **Offline scope**: an already-open workout keeps working without a connection, and it can be reloaded offline. The service worker serves a static `/offline` shell that restores the session from this device. Other screens (splits, history, finishing, discarding) need a connection. The service worker caches only that static shell and content-hashed build assets, never authenticated pages or API responses. Signing out clears the user's local data after warning about anything unsynced.

### Rest timer

Remaining time is derived from the start timestamp (`Date.now()`), not from counting ticks, so it stays correct after the phone locks or the app is backgrounded. It uses the exercise's rest target or your default. Auto-start after confirming a set is optional, and it needs no notification permission (it vibrates briefly where supported).

---

## Verification

| Scenario | Covered by |
|---|---|
| A. History across splits | `tests/db` (SQL), `tests/e2e` (UI: Split B shows `72.5 × 9` from Split A) |
| B. Shared split with personal history | `tests/db`, `tests/e2e` |
| C. Template edits preserve history | `tests/db` (rename, remove exercise, delete template and split) |
| D. Active split periods | `tests/db` (A → B → A, repeats, overlaps, corrections, archiving) |
| E. Recovery and synchronisation | `tests/unit/sync.test.ts` (lost responses, reload, reconnect), `tests/e2e` (real offline reload, exactly-once check in the database) |
| F. Unperformed values | `tests/unit/doc.test.ts`, `tests/db`, `tests/e2e` |
| G. Custom exercises | `tests/db` (no merging, explicit mapping only, no access to another user's exercise) |
| H. Access controls | `tests/db` (unauthenticated and unrelated users, id hijacking, function access) |
| I. Timer | `tests/unit/timer.test.ts`, `tests/e2e` (clock jumped without ticks) |

## Known limitations (V1)

- Kilograms only (the `weight_unit` column exists for a later lb option).
- Email + password sign-in only; there is no password-reset screen yet (Supabase's reset email can be enabled later).
- Finishing, discarding and starting workouts need a connection. The app as a whole is not offline-first.
- Conflict resolution is per workout (keep this version or the other), not per set.
- Reordering uses up/down controls rather than drag and drop.
- No supersets, drop-set structures, RIR, or weekly scheduling, by design.
