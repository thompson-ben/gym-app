# notchlift.

> Formerly **Splitmate**. User-facing text now says NotchLift; internal identifiers (on-device storage keys such as `splitmate:v1:…`, the local Supabase `project_id`, fixture accounts) keep the old name on purpose so existing devices and data are unaffected.

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
| `npm run test:e2e` | Playwright against a production build and local Supabase (run `npm run build` first; reads the local stack's keys from `supabase status`). Default project is Chromium; `--project=iphone-webkit` runs Safari's engine with an iPhone profile where WebKit is installed (e.g. inside `mcr.microsoft.com/playwright`) |
| `npm run db:reset` | Re-apply all migrations and the local seed |
| `npm run icons` | Regenerate PWA icons |
| `node scripts/dev-fixtures.mjs` | **Local only.** Creates three fixture accounts (`new@`, `one@`, `active@fixtures.splitmate.test`, password `splitmate-fixture`): no data, one session, and a realistic active user with an old split, long names, high-rep sets, a custom variant and a quick workout. Refuses to run against anything but localhost |

---

## Deployment (Supabase + Vercel)

Use a **dedicated** Supabase project for NotchLift: the migrations create tables and functions in `public`, so never point it at another product's project. The app needs **no service-role key**; all data access runs as the signed-in user under Row Level Security.

### 1. Supabase project

1. Create a project named e.g. `splitmate` (dashboard → New project). Note its **project ref** (the `<ref>` in `https://<ref>.supabase.co`).
2. From this repository:
   ```bash
   npx supabase login                       # opens a browser; no token goes in the repo
   npx supabase link --project-ref <ref>    # confirm the prompt names the app's own project (created as "splitmate")
   npx supabase db push                     # applies supabase/migrations/* (schema, functions, catalogue, past workouts, profile backfill, backdated activation, quick workouts)
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
   - *Confirm signup*: subject `Confirm your NotchLift account`, body `supabase/templates/confirmation.html`
   - *Reset password*: subject `Reset your NotchLift password`, body `supabase/templates/recovery.html`
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
| `localStorage` key `splitmate:v1:<user-id>:session:<session-id>` | The in-progress workout: exercises, sets (confirmed and draft), the pending write and its write id, server revision, conflict copy, last-session sets for the Previous column, cached next-session targets and which ones you hid (suggestions only, never synced), rest-timer start, logger settings | Per browser profile and origin; namespaced by the signed-in user's id; every read checks that the stored user id matches |
| `localStorage` key `splitmate:v1:last-user` | Only the id of the last signed-in account (lets the offline shell find that account's workout) | Per browser profile |
| Cache Storage `splitmate-shell-<build id>` (service worker; replaced on each deployment) | The static `/offline` page and content-hashed JS/CSS, icons and manifest. **No user data**: no authenticated page, RSC payload or API response is ever cached | Per origin |
| Cookies `sb-<ref>-auth-token*` (set by Supabase) | The auth session | Per origin |
| Cookie `sm_tz` | Browser time zone, so the server formats dates correctly | Per origin |

So "not cached by the service worker" does **not** mean "not stored locally": the workout itself is deliberately stored in `localStorage` so a set is never lost to a dropped connection; the service worker only stores the code needed to open it.

**Account isolation and unsynced edits**

- A record is only ever loaded for the account whose id is in its key *and* body, and the sync code sends it only while that same account is signed in (it checks the Supabase session's user id before every write). If the session expired or another account is signed in, nothing is sent: the badge shows **Sign in to sync** and the edits are kept.
- Finishing or discarding a workout is refused unless the owning account is signed in, so another account can never cause a local workout to be dropped.
- **Sign out** (Profile) checks for unsynced edits first and warns; confirming signs out and deletes that account's local workout data from the device. With nothing unsynced it clears silently.
- **Switching accounts** without signing out (e.g. a session expired and someone else signs in): on sign-in, other accounts' records that are fully synced are deleted; records with unsynced edits are kept, still invisible to the new account, so their owner can sync them after signing back in.

### Logging past workouts

**Train → Log past workout** (top right, also on each workout preview): choose the workout, pick the date and time it was performed, then log as usual. The logger shows "Logging a past workout" and, on finishing, the workout is saved for that date (not the day it was typed in). You can also move a workout later: **Change workout date** in the logger menu, or **Edit → Change date** on a finished workout (moving keeps its duration). Future dates are rejected.

History, the Previous column and charts are ordered by the performed date, so past workouts can be entered in any order; while logging a past workout the Previous column compares with the workout *before* its date. The active-period "workouts completed" count includes a past workout only if its date falls inside the period; set the split's start date (split page → **Change start date**, or **Activate from an earlier date**; Train → tap the active split summary) if you activated the split after you started training on it.

### Quick workouts

**Train → Quick workout** starts a one-off session with no template: give it an optional name, then tick the exercises you're doing (the picker allows several at once, added in the order ticked). It isn't part of any split, so it doesn't count towards a split's active period, but every set counts towards each exercise's history and Previous column. "Log a past quick workout" works like Log past workout. Any workout can be renamed from the logger menu (the template is not affected).

### Train: what comes next

Train leads with one decision. If a workout is in progress, **Resume** replaces everything else (a second session cannot be started). Otherwise it shows a compact summary of the active split (one tap to its page, where dates are managed), the **suggested next** workout, the other workouts as compact rows (tap for a preview, or Start), Quick workout, and the last three workouts. "Log past workout" sits in the header.

The suggestion is a rotation hint, never a readiness judgement (`src/lib/next-workout.ts`, unit-tested): **the active split's workout done longest ago.**

- Only the active split's current workouts are candidates; empty workouts are passed over.
- "Done" means a completed session of that workout, dated when it was performed, so a past workout logged today counts on its own date. Quick workouts and other splits' workouts never count.
- A workout never done comes first (in split order). Otherwise the one with the oldest last-performed date; ties go to the earlier one in the split's order.

Tapping a workout opens a **preview** (`/train/workout/[id]`): exercise order, sets and rep ranges, last performance, notes and any target. Starting never requires the preview.

### Next-session targets (optional)

Off by default. Switch on per exercise in a workout (**Edit workout → exercise → Next-session targets**) and choose the weight you add when moving up (no default increment). Rules (`src/lib/progression.ts`, unit-tested):

| Rule | Detail |
|---|---|
| Eligible | Weight × reps exercises with a rep range (min and max) and a working-set count. Bodyweight and added-weight exercises are never progressed automatically: bodyweight is not recorded |
| Comparable basis | Same exercise identity (each gym variant is its own exercise) and the **same prescription** as now: identical rep range and set count in that session's snapshot. The same workout entry is preferred; otherwise the latest comparable performance from another workout is used and named ("Based on Upper B, 3 Oct") |
| Sets used | The first *N* completed working sets (*N* = working-set count). Warm-ups, unconfirmed and skipped sets never count; extra sets are ignored |
| No target | Fewer than *N* working sets completed, working sets at different weights, no comparable session, or settings incomplete. A short note says why |
| Increase | Every working set reached the top of the range → weight + your increment, aim for the bottom of the range ("You reached the top of your rep range on all working sets.") |
| Repeat | Otherwise → same weight, one more rep per set up to the top of the range. The weight is never lowered automatically |

Without targets switched on, an exercise whose last session reached the top of the rep range on every planned working set shows a factual nudge, **"Ready to go heavier"** (loaded exercises only; it names no weight because the increment is unknown), with a link to switch targets on. Targets can also be switched on or off mid-workout from the exercise's ⋯ menu → **Next-session targets**; this saves to the workout so it applies next time too.

When every target set is met or beaten (each completed working set at the target weight or heavier, with at least the target reps), the card shows **"Target hit!"** with a short pop and burst (skipped with reduced motion; no sound or vibration). Without a target, completing every planned working set at the top of the range shows **"Top of your range!"**. Both are derived from the logged sets, so undoing a set removes them, and reloading a finished exercise shows the banner without replaying the animation.

In the logger a target sits in a dashed **Target** box, apart from the Previous column. "Use 102.5 kg for remaining sets" only changes unconfirmed working-set weights; reps stay empty and nothing counts until each set is confirmed. **Hide** dismisses it for that session (stored on the device only). Targets are computed when needed and never stored as sets or in the session, so they cannot become, or be mistaken for, results.

### Workout summary and records

After finishing (and whenever a workout is opened later) the summary shows exercises and working sets, duration only for workouts logged live and between 5 minutes and 6 hours, a factual change per exercise against its previous session ("2 more reps at 30 kg"; only sets both sessions have are compared, so extra sets are never "better"), records, and next targets where this workout is their basis. Records (`src/lib/records.ts`) are recomputed from current history every time, so editing, re-dating or deleting a workout updates them:

- **First recorded performance**: no earlier working set of the exercise. Shown as "Your baseline is set"; no other record is claimed.
- **Heaviest load**: more weight (or added weight) than any earlier working set.
- **Rep record at a load**: more reps at a weight lifted before.
- **Estimated 1RM record**: Epley estimate from sets of 1–12 reps beats every earlier eligible set; always labelled as an estimate.
- Ties are never records. Warm-ups never count.

### Progress, history and split review

- **Exercise progress**: identity → latest session and its change → chart with the Est. 1RM / Volume / Heaviest tabs (shown from the first session; without a choice it opens on the first metric that has data, e.g. Volume when every set is above 12 reps) → full history → "How these numbers are calculated" on demand. **Best set** is the completed working set with the highest estimated 1RM *among sets of 12 reps or fewer* (high-rep sets only win when nothing else exists, by load). Chart points can be inspected by touch, mouse or arrow keys, and the same data is available as a table. Metrics: **Est. 1RM** (Epley `weight × (1 + reps ÷ 30)`, sets of 1–12 reps), **Volume** (weight × reps over working sets), **Heaviest**; reps-only and added-weight exercises show heaviest/most reps and total reps only.
- **Workout history** (`/history`): every completed workout by month performed.
- **Split review** (`/splits/[id]/review/[period]`, linked from each active period and from Progress): sessions performed during the period (half-open: start ≤ performed < end), working sets per Monday–Sunday week in your time zone, a breakdown by workout, and first-vs-latest best set for exercises done at least twice. It describes what was logged only: no adherence scores, no causal claims, and names appear as they were logged, so later template edits do not rewrite it.

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
| Next-workout order, overrides, retrospective entries | `tests/unit/next-workout.test.ts`, `tests/e2e/daily-training.spec.ts` |
| Target eligibility and suppression | `tests/unit/progression.test.ts`, `tests/db` (opt-in, snapshot prescription, skipped entries, privacy) |
| Targets never become sets | `tests/unit/doc.test.ts` (`applyTargetWeight`), `tests/e2e/daily-training.spec.ts` (database holds only confirmed sets) |
| Records after edits, ties, warm-ups, high-rep sets | `tests/unit/records.test.ts`, `tests/unit/progress.test.ts` |
| Split-period boundaries, weekly sets | `tests/unit/split-review.test.ts` |
| Cross-account privacy of new pages | `tests/e2e/auth.spec.ts` (preview, split review, history) |

### Memberships, founders and your data

Every account has a membership row (`public.memberships`): `founder`, `trial`, `paid` or `lapsed`. Users can read their own (Profile shows "Founding member") but cannot change it; only the owner can, from the Supabase SQL Editor. Payments are not built yet, so nothing is gated on it today.

| Task | SQL |
|---|---|
| Tag someone as a founder | `update public.memberships set status = 'founder', trial_ends_at = null where user_id = (select id from auth.users where email = 'friend@example.com');` |
| See everyone's status | `select u.email, m.status, m.trial_ends_at from public.memberships m join auth.users u on u.id = m.user_id order by m.created_at;` |
| Close the founding phase (new sign-ups start a 14-day trial instead) | `update public.app_settings set auto_founder = false;` |

While `auto_founder` is on (the default), **every new sign-up is a founder automatically**, and the migration made all existing accounts founders.

- **Export:** Profile → Your data → *Export as spreadsheet* (`/api/export?format=csv`: one row per completed set, local date and time, UTF-8 with BOM, formula-safe) or *Export everything* (`?format=json`: profile, membership, custom exercises, splits with workouts and periods, all workouts). Both run as the user under RLS.
- **Delete account:** Profile → Your data → Delete account (type DELETE). `delete_my_account()` removes the user's workouts, shares, splits, custom exercises, membership, profile and auth user, then the app clears local data. Friends' copies of shared splits are independent and stay.
- **Privacy and terms:** `/privacy` and `/terms` are public and linked from sign-up and Profile. They are a plain-English starting point; have them reviewed before charging. Set `NEXT_PUBLIC_CONTACT_EMAIL` in Vercel to show a contact address (otherwise they say "the person who invited you").

### First run, feedback and installing

- **First run:** an account with no splits sees a welcome on Train with three steps and *Start from a template* (Full Body, Upper / Lower, Push / Pull / Legs; `src/lib/starters.ts`). The chosen split is created and activated in one transaction (`create_split_from_plan`), built only from catalogue exercises, and is fully editable afterwards.
- **Feedback:** Profile → App → *Send feedback* (problem, idea, other). Stored in `public.feedback` with the last screen visited, app build and device; users can submit but not read it. Read it in the SQL Editor:
  `select f.created_at, u.email, f.kind, f.message, f.page from public.feedback f join auth.users u on u.id = f.user_id order by f.created_at desc;`
- **Add to Home Screen:** phone users in a browser see a dismissible card on Train. On Android/Chrome it opens the browser's own install prompt when available; on iPhone it shows the Share → Add to Home Screen steps (iOS has no install prompt). Always available again from Profile → App. Hidden once opened from the Home Screen icon.

### One-time tips

Train, the workout logger, Splits and Progress each show a short **Tip** card the first time they are opened on a device, explaining that screen's key points. "Got it" hides it for good (stored in the browser, not the account); Profile → App → **Show tips again** brings them all back.

### Upgrading an existing deployment

Migrations are additive and versioned; never reset a deployed database.

1. **Apply `supabase/migrations/20261002000008_progression_targets.sql` first** (`npx supabase db push`, or paste it into the SQL Editor). It adds `template_exercises.progression_enabled` (default `false`) and `progression_increment_kg` (nullable), re-creates `duplicate_split`/`duplicate_template` so copies keep those settings, and adds the read-only `progression_candidates` function. It does not touch sessions, sets, snapshots or exercise identities.
   Then `supabase/migrations/20261003000009_memberships_and_account_deletion.sql` and `…0010_feedback_and_starter_splits.sql`, and (memberships, `app_settings`, `delete_my_account`). Apply both in filename order; each is additive and safe to run before the app that uses it.
   Then `…0011_weight_units.sql`: allows `profiles.weight_unit = 'lb'` and widens `session_sets.weight_kg` / `progression_increment_kg` to 4 decimal places. Existing values are unchanged; old app versions keep working.
   Then `…0012_group_workouts.sql`: adds group workouts (three new tables, a nullable `workout_sessions.group_workout_id`, and functions). Additive; old app versions keep working.
   Then `…0013_analytics.sql`: first-party analytics and the admin dashboard (new tables and functions only).
   Then `…0014_payments.sql`: paid membership (Stripe), the free-trial gate, trial reminders and free access for friends. Additive; see Payments below.
   Then `…0015_free_access_and_launch.sql`: separates free access (stays free) from early access (trial at launch) and adds the launch switch. Additive.
2. **Then deploy the app.** Old app versions keep working against the migrated database (they ignore the new columns). If the app were deployed first, the workout editor would fail to load until the migration runs, while the logger and summaries simply show no targets.
3. Offline compatibility: workouts already open on a device keep working; local records saved by the previous version have no `targets` field and load normally. The service worker is now registered per build (`/sw.js?v=<commit>`), so each deployment installs a fresh offline shell and removes the old cache; pages themselves are always fetched from the network first.

## Monitoring and analytics

- **Errors (Sentry):** off unless `NEXT_PUBLIC_SENTRY_DSN` is set (Vercel → Settings → Environment Variables, Production). Server errors are reported from `src/instrumentation.ts` (`onRequestError`), browser errors from `src/instrumentation-client.ts` and the error pages. The SDK is loaded on demand, so it adds nothing to first load. `src/lib/monitoring.ts` strips user, cookies, headers, request data and emails, and blanks invite/share tokens and auth parameters in URLs (unit-tested). Errors only: no tracing or session replay. Stack traces are minified (no source map upload).
- **Analytics (first party, migration 13):** anonymous visits to public pages (`visit`, once per tab session) and sign-up form views, recorded through `/api/track` → `track_event()`. No visitor id, IP or user agent is stored; device and country come from the request. Campaign tags (`utm_*`), Facebook ad clicks (`fbclid`, not stored) and referring sites set a 30-day `nl_src` cookie with no identifier; after sign-in it becomes the account's first-touch attribution (`record_attribution()`, new accounts only). GPC/DNT browsers and bots are skipped.
- **Admin dashboard (`/admin`):** funnel, daily visits/sign-ups/workouts, sources and campaigns, retention, feature use and memberships, from `admin_overview()` (totals only). Only accounts in `public.admins` can open it; add yourself in the SQL Editor:
  `insert into public.admins (user_id) select id from auth.users where email = 'you@example.com';`

## Payments (Stripe)

**Model:** new accounts get a 14-day free trial, with no card needed. After that, membership is £3.99 a month or £30 a year (`src/lib/billing/plans.ts`).
- When a trial ends unpaid, or a subscription ends, history, progress and export stay available. Starting new workouts is paused by a trigger on `workout_sessions` (`membership_required`), and the app shows the plans instead.
- Founders, and friends given free access from `/admin`, never pay.
- Stripe Checkout and Stripe's billing page handle all card details.
- Webhooks (`/api/stripe/webhook`, signature-verified) update memberships through `billing_*` functions. These require the app's `BILLING_SECRET`; the database stores only its SHA-256. The app never holds a master database key.

**Setup:**
1. Run migration 14.
2. Generate two random secrets (for example `openssl rand -hex 32`): `BILLING_SECRET` and `CRON_SECRET`. In the SQL Editor:
   `update public.app_settings set billing_secret_hash = encode(extensions.digest('<BILLING_SECRET>', 'sha256'), 'hex');`
3. Stripe (test mode first):
   - Create a product **NotchLift** with two recurring GBP prices: £3.99 monthly (lookup key `notchlift_monthly`) and £30 yearly (lookup key `notchlift_yearly`).
   - Customer portal: allow cancelling, updating the payment method and switching between the two prices.
   - Webhook endpoint: `https://www.notchlift.com/api/stripe/webhook` (the www address: notchlift.com redirects there, and Stripe doesn't follow redirects), with the events `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted` and `invoice.paid`.
4. Vercel → Environment Variables (Production): `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `BILLING_SECRET`, `CRON_SECRET`, `RESEND_API_KEY` (and optionally `EMAIL_FROM`). Then redeploy.
5. Trial reminder email, once a day. In Supabase, enable the `pg_cron` and `pg_net` extensions, then:
   `select cron.schedule('trial-reminders', '0 9 * * *', $$ select net.http_post(url := 'https://www.notchlift.com/api/cron/trial-reminders', headers := jsonb_build_object('Authorization', 'Bearer <CRON_SECRET>'), timeout_milliseconds := 60000) $$);`
6. Go live:
   - Repeat step 3 in Stripe live mode, and swap the live keys into Vercel.
   - Then **Admin → Launch**, typing `LAUNCH`. New sign-ups start the trial, and every early-access member starts a 14-day trial that day and gets a short email. Anyone with free access is untouched. The landing page's pricing switches with it (`paid_plans_live()`).

**Free access vs early access:** both have status `founder`; `memberships.free_access` marks people who stay free for good.
- Admin → Free access: an existing account becomes free immediately. Anyone else is emailed an invite and gets free access when they sign up with that address (`free_access_invites`).
- The Early access list shows everyone else who signed up before launch. Each can be given free access with one tap.

## Group workouts

Train together from one shared plan (`/together`, invite links at `/join/<token>`). The host creates a group workout from one of their workouts or from scratch, edits the plan (host only) and shares the link. Anyone with the link can see the plan and join, up to 10 people. Everyone starts their own session from the plan and logs their own sets in their own history. Members see each other's chosen display names and whether each has started or finished, never weights, reps or history: sessions stay owner-only. A host's custom exercise becomes the member's own copy the first time they train it (reused afterwards, so their history continues).

## Weight units

Every weight is stored in kilograms with 4 decimal places. Profile → Weight unit (kg or lb) only changes how weights are entered and shown (`src/lib/units.ts`): a pound value typed to 0.01 lb converts to kg and back exactly, so switching units never changes logged data. Targets, records, charts and the CSV export (`weight_kg` or `weight_lb` column) follow the chosen unit; the JSON export stays in kg.

## Known limitations (V1)

- Email + password sign-in only (no social or magic-link sign-in).
- A custom exercise cannot be merged into a catalogue exercise afterwards (deliberately: no silent merging). If the demo incline press turns out to be a catalogue variation, future sessions can use that exercise, but past sets stay on the custom one.
- Finishing, discarding and starting workouts need a connection. The app as a whole is not offline-first.
- Conflict resolution is per workout (keep this version or the other), not per set.
- Reordering uses up/down controls rather than drag and drop.
- No supersets, drop-set structures, RIR, or weekly scheduling, by design.
