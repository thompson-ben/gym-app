# iOS 1.2 release: Apple Health (in progress)

**Update 24 Nov:** build 4 had the Health text but **not** the Apple Health code (the Mac was still on PR #67), so **don't submit build 4**. The Mac was updated (git stash → pull to #74 → stash pop → Info.plist conflict resolved with the repo copy → cap sync). Capabilities checked: HealthKit and Sign In with Apple. **1.2 (5) uploaded and tested on TestFlight:** the Apple Health switch works, and a finished workout appeared in Health as "Traditional Strength Training" with the Setmodo icon (calories show "--"; estimated calories could come later). Training-day notifications show in Profile. Next: **submit build 5**, then reply to the member.

Status (23 Nov): the web side (PR #75) is merged. The first upload of 1.2 was **rejected by App Store Connect**: "Missing purpose string in Info.plist" for `NSHealthShareUsageDescription` and `NSHealthUpdateUsageDescription`. Both keys are in the repo's `ios/App/App/Info.plist`, so the Mac's copy probably didn't pick up the change.

## Next steps (on the Mac)
1. **Xcode → App target → Info tab → Custom iOS Target Properties → +**
   - **Privacy - Health Update Usage Description**: `Setmodo saves your finished workouts to Apple Health as strength training, so they count towards your Activity rings.`
   - **Privacy - Health Share Usage Description**: `Setmodo doesn't read anything from Apple Health. It only saves your finished workouts there.`
   - If either already exists, check the value matches.
2. **⇧⌘K** (Clean Build Folder). In General, raise the **Build** number by 1 (Version stays 1.2).
3. Device **Any iOS Device (arm64)** → **Product → Archive** → **Distribute App → App Store Connect → Upload**.
4. In Terminal (gym-app folder), run `git status` and `git log -1 --oneline` and send the output to Claude. It should mention "Merge pull request #75". If it doesn't, the pull didn't work and the Apple Health code may be missing too.
5. **TestFlight test:**
   1. Profile → Workout preferences → turn on **Save workouts to Apple Health**, then allow **Workouts**.
   2. Finish a quick workout.
   3. Check Health → Browse → Activity → **Workouts** shows Strength Training from Setmodo.
6. **App Store Connect:** create version **1.2** → What's New: *"Save your workouts to Apple Health. Turn it on in Profile → Workout preferences, and every finished workout counts towards your Activity rings as strength training."* → add the build → no App Privacy change → **Submit**.
7. **Once live:** reply to the member who asked for Apple Health (survey answer from 9 Nov), and give them a fresh trial.

## Already done
- HealthKit capability added in Xcode (Signing & Capabilities).
- Version set to 1.2.
