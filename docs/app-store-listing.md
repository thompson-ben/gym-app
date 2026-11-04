# Setmodo: App Store Connect pack

Copy each block into App Store Connect. Character limits are shown, and every field below fits.

---

## 1. App information

| Field | Value |
|---|---|
| Name (30) | **Setmodo: Workout Tracker** (24) |
| Subtitle (30) | **Gym log, plans & progression** (28) |
| Bundle ID | com.notchlift.app |
| SKU | setmodo-ios |
| Primary category | Health & Fitness |
| Secondary category | Lifestyle (optional) |
| Primary language | English (U.K.) |
| Content rights | No third-party content |
| Age rating | Answer **None / No** to everything. Result: **4+** |
| Support URL | https://www.setmodo.com (the footer shows the contact email, which Apple asks for) |
| Marketing URL | https://www.setmodo.com |
| Privacy policy URL | https://www.setmodo.com/privacy |
| Copyright | 2026 B A Thompson Ltd |

> The name field can't hold "Setmodo" on its own if the reservation was made as "Setmodo". That's fine: you can change the name to "Setmodo: Workout Tracker" on the version page before submitting. Apple keeps the reservation either way.

## 2. Keywords (100)

```
weightlifting,strength,training,planner,split,ppl,bodybuilding,1rm,reps,sets,routine,notebook,lift
```
That's 98 characters. Words already in the name or subtitle (workout, tracker, gym, log, plans, progression) are left out, because Apple indexes those anyway.

## 3. Promotional text (170, can be changed any time without review)

```
Every set shows what you lifted last time, and Setmodo tells you when to add weight. Plan your split, log in one tap, and watch your lifts climb. 14 days free.
```

## 4. Description (4000)

```
Stop guessing. Start progressing.

Setmodo is a workout planner and tracker built for the gym floor. Plan your split, see exactly what you lifted last time beside every set, and know when it's time to add weight.

LAST TIME, BESIDE EVERY SET
No scrolling back through notes. Last session's weights and reps sit next to each set, today's weights are filled in, and one tap records it. Warm-ups stay separate from working sets.

TARGETS THAT TELL YOU WHAT TO DO NEXT
Switch on targets and Setmodo applies double progression for you: more reps until you own the range, then more weight. Set your own increment (2.5 kg plates, 2 kg dumbbells or 5 lb jumps). They're suggestions; nothing is logged until you confirm it.

PROGRESS YOU CAN SEE
Charts for estimated 1RM, volume and heaviest set on every exercise, plus your records. History follows the exercise, so changing your programme never resets your progress.

PLANS READY IN A MINUTE
Start from Push / Pull / Legs, Upper / Lower or Full Body, or build your own workouts with sets, rep ranges and rest times. Your next workout is waiting when you open the app.

SUPERSETS
Link two or three exercises and Setmodo runs them as rounds. The rest timer waits until the round is done, and each lift keeps its own history and targets.

TRAIN TOGETHER
Plan a group workout, send the link, and everyone trains from the same plan on their own phone. See who's training and who's finished. Your weights and reps stay private.

BUILT FOR REAL GYMS
• Works without signal: every set saves on your phone first and syncs later
• Rest timer that stays right when your phone locks
• kg or lb, switch any time
• Log past workouts with the right date
• Share a split with a friend; your numbers stay private
• Export all your data at any time

MEMBERSHIP
Try everything free for 14 days. Then choose Setmodo Pro monthly or yearly to keep logging new workouts. If you don't, nothing is deleted: your history stays viewable and exportable.

Payment is charged to your Apple ID. Subscriptions renew automatically unless cancelled at least 24 hours before the end of the current period. Manage or cancel in your App Store account settings.

Terms: https://www.setmodo.com/terms
Privacy: https://www.setmodo.com/privacy
```

## 5. What's New (first version)

```
Welcome to Setmodo on iPhone. Sign in with Apple, share your workouts and exports straight from the share sheet, and pick up exactly where you left off on the web.
```

## 6. Subscriptions (App Store Connect → Subscriptions)

- **Subscription group:** Setmodo Pro
- **Group display name:** Setmodo Pro

| Product ID | Reference name | Duration | Price (UK) | Display name | Description (45) |
|---|---|---|---|---|---|
| notchlift_monthly | Monthly | 1 month | £3.99 | Setmodo Pro Monthly | Log new workouts, targets and progress |
| notchlift_yearly | Yearly | 1 year | £29.99 (or £30.00 if offered) | Setmodo Pro Yearly | A year of Setmodo Pro, save 37% |

- The product IDs must match exactly. They keep the old name because RevenueCat and the code already use them, and customers never see them.
- **Introductory offer:** none in Apple. The 14-day trial runs on our side, from sign-up, the same as on the web.
- Each subscription needs a review screenshot of the paywall. Use a screenshot of the Upgrade screen in the app.
- **Apple Small Business Program:** enrol at developer.apple.com/app-store/small-business-program. It cuts Apple's commission from 30% to 15% while you earn under $1M a year. It's free and takes a few minutes. Do it before the first sale.

## 7. App Privacy (App Store Connect → App Privacy)

**Do you or your third-party partners collect data from this app?** Yes.

**Tracking:** answer **No** to "used to track". The Meta Pixel never loads in the iOS app (PR #56), so no App Tracking Transparency prompt is needed.

Answer each type below as follows:
- Linked to the user's identity: **Yes**, unless the table says otherwise.
- Used for tracking: **No**, every time.

| Data type | Collected | Purposes | Linked to user |
|---|---|---|---|
| Contact Info → Email Address | Yes | App Functionality | Yes |
| Contact Info → Name | Yes (optional display name / Apple name) | App Functionality | Yes |
| Health & Fitness → Fitness | Yes (workouts, sets, weights) | App Functionality | Yes |
| Purchases → Purchase History | Yes | App Functionality | Yes |
| User Content → Customer Support | Yes (help messages, feedback) | App Functionality | Yes |
| User Content → Other User Content | Yes (workout notes, split names) | App Functionality | Yes |
| Identifiers → User ID | Yes (account ID, shared with RevenueCat) | App Functionality | Yes |
| Usage Data → Product Interaction | Yes (sign-up steps, survey answers, how you heard about us) | Analytics | Yes |
| Diagnostics → Crash Data | Yes (Sentry) | App Functionality | **No** |
| Diagnostics → Other Diagnostic Data | Yes (Sentry error reports) | App Functionality | **No** |

Everything else: **not collected**. That covers location, contacts, photos, browsing history, search history, financial info (Apple handles payment), sensitive info, health (the Health category, not Fitness), and the advertising identifier.

## 8. App Review information

- **Sign-in required:** Yes
- **Demo account:**
  - Make one now, with an address you don't publish, e.g. `appreview@setmodo.com` (forward it to your mailbox) and a strong password.
  - Confirm the email.
  - Pick a starter split and log one short workout, so the reviewer sees history and targets.
  - Admin → Free access: give it free access, so the reviewer isn't stuck behind a paywall. Then also test that **purchasing** works with a sandbox Apple ID, because the reviewer may try to buy.
- **Contact:** your name, a phone number you don't publish, and an unpublished email.
- **Notes for the reviewer:**

```
Setmodo is a workout planner and logger for the gym.

Demo account (email sign-in on the first screen):
  Email: <appreview address>
  Password: <password>
This account has an active membership, so every feature is available. It already has a split and one logged workout.

To try it: tap Train, start the suggested workout, then tap a set to log it. Weights and reps from the last session are shown beside each set. Progress shows the charts.

Membership: new accounts get a 14-day free trial, then Setmodo Pro (monthly or yearly) is sold through In-App Purchase in the app. Members who joined on our website keep the membership they already bought; the app does not link to or mention outside payment.

Account deletion: Profile → Your data → Delete account.
Sign in with Apple is offered alongside email sign-in.
```

## 9. Screenshots

- Needed: 6.9" iPhone (1320 × 2868, or 1290 × 2796). Apple scales these down for smaller iPhones.
- iPad is only required if the app is marked as supporting iPad. Keep it iPhone-only for launch.
- I can produce these, in our dark style, once the app is on TestFlight: logger, target hit, progress chart, next workout, superset, group workout, each with a headline.

## 10. Still to do before pressing Submit

1. **Revoke the Apple sign-in token on account deletion.** Apple requires this (guideline 5.1.1(v)) for accounts made with Sign in with Apple. I'll build it as part of the TestFlight work.
2. **Landing page copy.** It still says "nothing to install from an app store". Change it to an App Store badge once the app is live.
3. **The app must not steer to Stripe.** The paywall in the app must only offer In-App Purchase, with no web prices and no links to pay on the website. PR #54 is built that way; double-check it on TestFlight.
4. **Agreements.** The Paid Apps agreement, bank and tax must be **Active**, or the subscriptions won't load in review.
