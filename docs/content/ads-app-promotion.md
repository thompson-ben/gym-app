# Meta "App promotion" campaign: setup (for Monday 23 Nov)

**Goal:** send iPhone users from the ad **straight to the App Store** (Download button), instead of via the website. Run it **instead of** the excuses website campaign, not alongside it, at **£10/day for one week**. Then compare.

Use a **computer** (adsmanager.facebook.com). The phone app hides some of these settings.

## Details you'll need

| | |
|---|---|
| App Store link | https://apps.apple.com/gb/app/setmodo-workout-tracker/id6830100182 |
| App Store ID | `6830100182` |
| Bundle ID | `com.notchlift.app` (the app's internal ID from before the rename; it can't change and nobody sees it) |
| App name | Setmodo: Workout Tracker |

## 1. Switch off the website campaign
In Ads Manager, turn **off** the *UK 18-44 – excuses* ad set in **NL – Sign-ups – Test 4**. (Running both means they compete for the same people.)

## 2. Register the app with Meta (one-off, about 10 minutes)
Meta needs to know the app before it can advertise it. If Ads Manager asks for this in step 3, follow its link. Otherwise:
1. Go to **developers.facebook.com** → **My Apps** → **Create app**.
2. When asked what the app is for, choose the option for **other** or **business** (not "Facebook Login"). Name it **Setmodo** and link your business account.
3. Open the new app → **Settings → Basic** → **+ Add platform** → **iOS**.
4. Enter the **Bundle ID** `com.notchlift.app` and the **iPhone Store ID** `6830100182` → **Save**.
5. Back in **Events Manager**, the app should now appear under your data sources.

If any screen asks you to add Meta's code (an "SDK") to the app, **skip it for now**. Installs are still counted through Apple's privacy system (SKAdNetwork); the SDK only makes optimisation faster.

## 3. Create the campaign
1. **+ Create** → objective **App promotion** → **Continue**. Choose **Manual app promotion campaign** if offered.
2. **Campaign name:** `Setmodo – App installs – Test 5`.
3. If there's an **iOS 14+ campaign** switch, turn it **on**.
4. **Budget:** £10 a day at campaign level.

## 4. Ad set
1. **App:** choose **Apple App Store**, then **Setmodo** (or paste the App Store link).
2. **Optimisation:** **App installs** (the default).
3. **Audience:**
   - Location: **United Kingdom**
   - Age: **18–44**
   - **Advantage+ audience** on, with interest suggestions: weight training, bodybuilding, powerlifting, physical fitness
4. **Devices:** **iOS only** (it usually sets this itself for an App Store app).
5. **Placements:** **Advantage+ placements**.

## 5. The ad
1. **Use existing post** isn't needed. Upload the **excuses video**: 9:16 for Reels and Stories, 4:5 for Feed (Media → *Customise for placements*).
2. **Primary text:**
   > Which excuse have you used? 😅 Setmodo puts last session's weights beside every set and tells you when it's time to go heavier. Built by one lifter. 14 days free.
3. **Headline:** *Stop guessing your weights*
4. **Call to action:** **Download** (or **Install now**).
5. There's no website link. The button goes to the App Store.
6. **Publish.**

## 6. How to judge it (Monday 30 Nov)
Admin can't see these installs directly (app sign-ups show as "direct"), so compare across sources:

| Where | What to look at |
|---|---|
| Meta Ads Manager | Installs and cost per install |
| App Store Connect → Analytics | First-time downloads by day, and Sources ("App Referrer" or "Web Referrer") |
| Admin | Sign-ups **in the app** (iPhone app line), and especially **Trained** |
| Admin → More detail | "How did you hear about us?" → Instagram |

**Keep it** if installs cost under about £3 and new app sign-ups **start training**. If installs come in but nobody signs up or trains, go back to the website campaign and try new creative instead.
