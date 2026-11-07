# Friends and badges: spec for review

**Status:** draft for review. Not started. Planned after launch week, as part of App Store update 1.1 (with supersets in quick workouts).

**Purpose:** see what your friends are training and copy their splits. Nobody's weights or reps are ever shown.

**Decided so far:**
- Friends see a split's **structure only**: exercises, sets, rep ranges and rest. They never see weights, reps, target weights or history.
- It's built to Apple's rules for social features: **block**, **report**, and a filter for offensive usernames.
- Everything is **off by default**. You choose to turn it on.

---

## Phase 1: usernames, friends and copying splits

### 1. Usernames

**Why not just the display name?** Display names aren't unique. Two people can both be "Ben", so you can't reliably find someone by it. We keep both:

| | Display name (existing) | Username (new) |
|---|---|---|
| Example | Ben Thompson | @benthompson |
| Unique | No | **Yes** |
| Shown | Next to your profile, in group workouts | Under your display name; used to find you |
| Rules | 1–60 characters, anything | 3–20 characters: lowercase letters, numbers, `_` and `.` |

- **Suggested from your display name.** When you turn on friends, Setmodo proposes a username from your display name ("Ben Thompson" → `benthompson`, or `benthompson2` if taken), and you can change it.
- **Optional until you use friends.** Nobody is asked for one unless they turn the feature on.
- **Can be changed**, at most once every 30 days. Your old username is held for 30 days, so nobody can impersonate you straight away.
- **Blocked:** offensive words (a standard list plus our own), and reserved names (`setmodo`, `admin`, `support`, `help`, `official` and so on).
- Matching ignores capitals: `@BenT` and `@bent` are the same name.

### 2. Turning it on (off by default)

**Profile → Friends → Turn on friends.** A short screen explains what friends will and won't see:

> **Friends can see:** your display name and username, your active split and how long you've been on it, when you last trained, your total workouts, and your badges. They can copy your split's exercises, sets and rep ranges.
>
> **Friends never see:** your weights, reps, targets, notes or workout history.

Then:
1. Choose your username.
2. **Who can find you by username:**
   - **Anyone with Setmodo** (default once you've turned friends on)
   - **Nobody, invite link only:** you can only add friends by sharing your link

Turning friends **off** later hides you from search, removes nothing, and stops friends seeing your profile until you turn it back on. Deleting your account removes your friendships, as with everything else.

### 3. Adding friends

Three ways:
1. **Search by username:** type `@ben…` and choose from matches. You only get results for exact starts of usernames, at most 10, so people can't browse everyone. People who chose "invite link only" never appear.
2. **Your friend link:** `setmodo.com/f/benthompson`. Share it on WhatsApp or Instagram. If the person doesn't have Setmodo, it takes them to sign up first (and counts as an invite for the existing referral reward).
3. **From a group workout:** "Add friend" next to anyone who trained with you.

**Requests:**
- Adding someone sends a **friend request**. They see it in **Profile → Friends** (with a small dot on the Profile tab), and can **Accept** or **Decline**.
- Declining is silent: the sender isn't told.
- A request expires after 30 days.
- At most 20 requests sent per day, to stop spam.
- **Friends are mutual:** once accepted, both see each other.

Emails or push notifications for requests aren't in phase 1. Push notifications are a separate planned piece of work, and requests can use them later.

### 4. Friends list

**Profile → Friends** shows:
- **Requests** (to accept or decline)
- **Friends**, most recently active first: display name, @username, active split, and "Trained 2 days ago"

### 5. A friend's profile

Opens from the list. Shows:
- Display name, @username, avatar letter
- **Active split:** e.g. "Push / Pull / Legs · since 21 Sep (7 weeks)"
- **Last workout:** e.g. "Trained Tuesday". This shows the day only, never the time, and never which workout or what was lifted.
- **Total workouts logged**
- **Badges** (phase 2)
- **Their split:** each workout in it, expandable to show exercises with sets and rep ranges (e.g. "Bench Press · 3 × 8–10 · rest 2:00"). Supersets show as A1 / A2.
- **Copy this split** (see 6)
- The **⋯** menu: **Remove friend**, **Block**, **Report**

**Never shown:** weights, reps, target weights, notes, workout history, personal records, charts, or the times you train.

**If they have no active split:** "No active split right now", with their other stats.

### 6. Copying a friend's split

- **Copy this split** adds a copy of their active split to your Splits, as **"[Split name] (from @username)"**.
- It works like the existing share links: exercises, sets, rep ranges, rest times and supersets are copied. Weights and targets aren't.
- **Custom exercises** they created are copied as your own custom exercises (as with share links today).
- Your copy is yours: their later changes don't affect it, and they aren't told you copied it.
- After copying: "Make it your active split?" with **Activate** / **Not now**.

### 7. Block and report (Apple requirement)

- **Block** (from a profile or a request): they're removed as a friend, can't find you in search, can't send you requests, and you won't see them. They aren't told. You can unblock in **Profile → Friends → Blocked**.
- **Report:** choose a reason (offensive username or display name, harassment or spam, something else), with an optional note. Reports go to **Admin → Reports** with the reported person's names. As admin you can **clear their username** (forcing a new one), **turn off their friends feature**, or **dismiss** the report.
- **Apple's rule:** we must act on reports within 24 hours. With your current numbers that's a quick daily check; Admin will show a count of open reports.
- Reporting also blocks automatically, unless the reporter chooses otherwise.

### 8. Privacy and data

- **The privacy policy** gets a new "Friends" section saying what friends see and that it's opt-in.
- **App Store privacy answers:** no new data types. Usernames are covered by "Name"/"User ID", and friend lists by "Other User Content", both used for App Functionality. We'll check the answers when submitting.
- All rules are enforced in the database (as with the rest of Setmodo), not only in the app. A friend's profile is only readable if you're friends and they've turned friends on.

### 9. Not in phase 1

- Activity feed ("Jordan finished Push")
- Comments, likes or messages
- Seeing friends' weights or records, even if they allow it
- Notifications (waits for push notifications)
- Following without accepting (one-way)
- Friend leaderboards

### Phase 1 open questions

1. **Search default:** once someone turns friends on, should they be **findable by username** by default, as above, or **invite link only** by default?
2. **Show which workout was last trained** ("Trained Push on Tuesday") or just the day, as above?
3. **Copied splits:** tell the friend ("Sam copied your split 💪")? I'd say not in phase 1: it needs notifications, and some people may prefer not.
4. **Friend limit:** cap friends at, say, 500? It only matters to stop abuse.

---

## Phase 2: badges

**Purpose:** a light reward for training consistently, shown on your profile and to friends. No points, streak pressure or leaderboards.

### Badges

Earned from your own history, automatically, including workouts imported from Strong or Hevy. Each badge is earned once and never lost.

| Group | Badges |
|---|---|
| **Workouts logged** | 1 (First workout) · 10 · 25 · 50 · 100 · 250 · 500 |
| **Time with Setmodo** | 1 month · 3 months · 6 months · 1 year (from your first workout) |
| **Consistency** | 4 weeks in a row · 12 weeks in a row · 26 weeks in a row (at least one workout each Monday–Sunday week) |
| **Progress** | First target hit · 10 targets hit (sets where you reached the top of your rep range on a target) |
| **Social** (needs phase 1) | First split shared or copied by a friend · Trained in a group workout |

The thresholds are a starting point, open to change.

### Where they show

- **Your Profile:** a Badges section with earned badges in colour and the next one in grey ("12 more workouts to 50").
- **Friends see** your earned badges on your profile. This is on whenever friends is on; a separate switch can hide badges.
- **Finishing a workout:** if it earns a badge, the workout summary shows it with a short celebration (the existing confetti style).

### Design

- **Simple icons** in Setmodo's style (dark tile with a green accent, number on top), not cartoon trophies.
- Each badge shows its name, when you earned it, and what it means.

### Phase 2 open questions

1. Is the **Consistency** group right, given it can feel like streak pressure? It never takes anything away, and a missed week just restarts the count.
2. **"Time with Setmodo":** count from **sign-up** or from the **first workout**? (First workout is as above.)
3. Show the **next badge** progress in grey, or only earned ones?
4. Any badge ideas of your own, especially ones that fit Setmodo's "know when to go heavier" angle?

---

## Rough build plan

| Step | What | You'll need to |
|---|---|---|
| 1 | Usernames, friends, requests, block, report (database and rules) | Run 1 migration |
| 2 | Friends screens: list, search, friend links, profiles, copy split | Test on TestFlight |
| 3 | Admin → Reports; privacy policy | Review the policy text |
| 4 | Badges (phase 2) | Run 1 migration |
| 5 | App Store update 1.1 (with supersets in quick workouts) | Build, upload and submit |

Every step comes with automated tests, including the privacy rules: that friends can never read weights, and that blocked users are invisible.
