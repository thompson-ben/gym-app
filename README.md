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

It contains one real reference workout (Chest & back, 21 September 2026) and two splits. Nothing else is invented, and new accounts start empty. The equipment used for the incline press is not confirmed, so it is logged on a custom exercise labelled **"Incline press · equipment unconfirmed"** rather than a catalogue variation. Once the variation is confirmed, edit the exercise (name, variant, equipment); its history is kept.

Emails sent by the local stack (sign-up confirmation, password reset) are caught by Mailpit at <http://127.0.0.1:54324>. Email confirmation is **on** locally, as in production.

### Scripts

| Command | What it does |
|---|---|
| `npm run dev` / `build` / `start` | Next.js |
| `npm run lint` / `typecheck` | ESLint / TypeScript |
| `npm run test:unit` | Pure logic: previous-set matching, session edits, sync engine, storage isolation, timer, formatting |
| `npm run test:db` | Migrations, functions and RLS against the local database (needs `db:start`) |
| `npm run test:e2e` | Playwright against a production build and local Supabase (run `npm run build` first; reads the local stack's keys from `supabase status`) |
| `npm run db:reset` | Re-apply all migrations and the local seed |
| `npm run icons` | Regenerate PWA icons |

---

## Deployment (Supabase + Vercel)

Use a **dedicated** Supabase project for Splitmate: the migrations create tables and functions in `public`, so never point it at another product's project. The app needs **no service-role key**; all data access runs as the signed-in user under Row Level Security.

### 1. Supabase project

1. Create a project named e.g. `splitmate` (dashboard → New project). Note its **project ref** (the `<ref>` in `https://<ref>.supabase.co`).
2. From this repository:
   ```bash
   npx supabase login                       # opens a browser; no token goes in the repo
   npx supabase link --project-ref <ref>    # confirm the prompt names the Splitmate project
   npx supabase db push                     # applies supabase/migrations/* (schema, functions, catalogue)
   ```
   `db push` never runs `supabase/seed.sql`, so no demo data reaches the hosted project.
3. **Authentication → Sign In / Providers → Email**: email + password on, **Confirm email on**, minimum password length **8**.
4. **Authentication → URL Configuration**
   - Site URL: `https://<production-domain>`
   - Redirect URLs (add each line):
     ```
     https://<production-domain>/auth/confirm
     https://<production-domain>/auth/reset
     https://*-<vercel-team-slug>.vercel.app/auth/confirm
     https://*-<vercel-team-slug>.vercel.app/auth/reset
     ```
     The last two let Vercel preview deployments use sign-up and password reset. Links whose redirect is not on this list fall back to the Site URL and will not complete.
5. **Authentication → Emails → Templates**: paste the two templates from this repository so links work on any device (the default templates use PKCE links that only work in the browser that asked for them; the app accepts both):
   - *Confirm signup*: subject `Confirm your Splitmate account`, body `supabase/templates/confirmation.html`
   - *Reset password*: subject `Reset your Splitmate password`, body `supabase/templates/recovery.html`
6. **Authentication → Emails → SMTP**: configure a real SMTP provider before inviting users. Supabase's built-in sender is heavily rate-limited and meant for testing.
7. **Project Settings → API Keys**: copy the Project URL and the **Publishable** key (`sb_publishable_…`; the legacy anon key also works).

### 2. Vercel project

1. Vercel → Add New → Project → import `thompson-ben/gym-app`. Framework preset Next.js; build and output settings unchanged.
2. Environment variables (Production **and** Preview):

   | Name | Value |
   |---|---|
   | `NEXT_PUBLIC_SUPABASE_URL` | `https://<ref>.supabase.co` |
   | `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | the publishable key |

   Both are public by design (they are sent to the browser); no secret is needed.
3. Deploy. Put the production domain into Supabase's Site URL and redirect URLs (step 1.4).

> Status: no deployment has been made or verified from this repository. The build session had no Supabase or Vercel credentials. All verification so far is against the local Supabase stack.

---

## Accounts and password reset

- Sign-up requires confirming the email address. The confirmation link lands on `/auth/confirm` and continues to where the person started (for example a shared split).
- **Forgot password?** on the sign-in screen opens `/forgot-password`. The response is always the same ("If an account exists for …, we have sent a link"), whether or not the address has an account; only rate limiting is reported.
- The reset email links to `/auth/reset`, which verifies the one-time token and opens `/reset-password` to choose a new password. Used, forged or expired links (including Supabase's own `otp_expired` redirect) return to `/forgot-password` with "That reset link is invalid or has expired". Opening `/reset-password` without a recovery session asks for a new link.
- Required redirect URLs: `/auth/confirm` and `/auth/reset` on every origin the app is served from (see Deployment step 1.4).

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

- Custom exercises are private rows owned by their creator. Users can add a **variant** (e.g. "Gym A · Hammer Strength"). Every custom exercise, variant or not, is its own row with its own id, and history is looked up by id only, never by name. Two "Chest press" machines with different variants, and the catalogue's Machine Chest Press, therefore keep three separate histories (covered by a database test, including after sharing and copying). Creating a custom exercise with a similar name only *suggests* the existing ones; nothing is merged automatically.
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
- **Offline scope**: an already-open workout keeps working without a connection and can be reloaded offline. Other screens (splits, history, finishing, discarding) need a connection.

### Where workout data lives on the device

| Store | What is in it | Scope |
|---|---|---|
| `localStorage` key `splitmate:v1:<user-id>:session:<session-id>` | The in-progress workout: exercises, sets (confirmed and draft), the pending write and its write id, server revision, conflict copy, last-session sets for the Previous column, rest-timer start, logger settings | Per browser profile and origin; namespaced by the signed-in user's id; every read checks that the stored user id matches |
| `localStorage` key `splitmate:v1:last-user` | Only the id of the last signed-in account (lets the offline shell find that account's workout) | Per browser profile |
| Cache Storage `splitmate-shell-v1` (service worker) | The static `/offline` page and content-hashed JS/CSS, icons and manifest. **No user data**: no authenticated page, RSC payload or API response is ever cached | Per origin |
| Cookies `sb-<ref>-auth-token*` (set by Supabase) | The auth session | Per origin |
| Cookie `sm_tz` | Browser time zone, so the server formats dates correctly | Per origin |

So "not cached by the service worker" does **not** mean "not stored locally": the workout itself is deliberately stored in `localStorage` so a set is never lost to a dropped connection; the service worker only stores the code needed to open it.

**Account isolation and unsynced edits**

- A record is only ever loaded for the account whose id is in its key *and* body, and the sync code sends it only while that same account is signed in (it checks the Supabase session's user id before every write). If the session expired or another account is signed in, nothing is sent: the badge shows **Sign in to sync** and the edits are kept.
- Finishing or discarding a workout is refused unless the owning account is signed in, so another account can never cause a local workout to be dropped.
- **Sign out** (Profile) checks for unsynced edits first and warns; confirming signs out and deletes that account's local workout data from the device. With nothing unsynced it clears silently.
- **Switching accounts** without signing out (e.g. a session expired and someone else signs in): on sign-in, other accounts' records that are fully synced are deleted; records with unsynced edits are kept, still invisible to the new account, so their owner can sync them after signing back in.

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
| Variants kept apart | `tests/db` (two variants + catalogue machine, previous, history, share/copy) |
| Sign-up confirmation, password reset | `tests/e2e/auth.spec.ts` (real emails through local Mailpit: neutral response, reset, reused/forged/expired links) |
| Account switching and sign-out | `tests/unit/store.test.ts`, `tests/unit/sync.test.ts`, `tests/e2e/auth.spec.ts` |
| Installable PWA | `tests/e2e/auth.spec.ts` (Chrome installability check, manifest) |

## Known limitations (V1)

- Kilograms only (the `weight_unit` column exists for a later lb option).
- Email + password sign-in only (no social or magic-link sign-in).
- A custom exercise cannot be merged into a catalogue exercise afterwards (deliberately: no silent merging). If the demo incline press turns out to be a catalogue variation, future sessions can use that exercise, but past sets stay on the custom one.
- Finishing, discarding and starting workouts need a connection. The app as a whole is not offline-first.
- Conflict resolution is per workout (keep this version or the other), not per set.
- Reordering uses up/down controls rather than drag and drop.
- No supersets, drop-set structures, RIR, or weekly scheduling, by design.
