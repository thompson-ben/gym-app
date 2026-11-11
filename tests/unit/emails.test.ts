import { describe, expect, it } from "vitest";
import { freeAccessEmail } from "@/lib/emails/free-access";
import { trialEndingEmail } from "@/lib/emails/trial-ending";

const base = { displayName: "Ben", trialEndsAt: "2026-10-09T12:00:00Z", unit: "kg" as const, workouts: 6, workingSets: 84, volumeKg: 12450, siteUrl: "https://setmodo.com" };

describe("emails", () => {
  it("trial ending: countdown, progress so far, and the yearly offer first", () => {
    const m = trialEndingEmail(base, new Date("2026-10-07T12:00:00Z"));
    expect(m.subject).toBe("Your Setmodo trial ends in 2 days");
    expect(m.html).toContain("Hi Ben,");
    expect(m.html).toContain("<strong>6 workouts</strong>");
    expect(m.html).toContain("<strong>12,450 kg</strong>");
    expect(m.html).toContain("Keep training for £30 a year");
    expect(m.html).toContain("£2.50 a month");
    expect(m.html).toContain("37% less");
    expect(m.html).toContain("https://setmodo.com/upgrade?plan=yearly");
    expect(m.html).toContain("Or £3.99 a month");
    expect(m.text).toContain("nothing is deleted");
  });

  it("trial ending: pounds, tomorrow, no workouts yet, and names are escaped", () => {
    const m = trialEndingEmail({ ...base, displayName: "<b>Sam</b>", unit: "lb", workouts: 0, workingSets: 0, volumeKg: 0, trialEndsAt: "2026-10-08T10:00:00Z" }, new Date("2026-10-07T12:00:00Z"));
    expect(m.subject).toBe("Your Setmodo trial ends tomorrow");
    expect(m.html).toContain("Hi &lt;b&gt;Sam&lt;/b&gt;,");
    expect(m.html).not.toContain("<b>Sam</b>");
    expect(m.html).toContain("You haven’t logged a workout yet");
    const lb = trialEndingEmail({ ...base, unit: "lb", volumeKg: 1000 }, new Date("2026-10-07T12:00:00Z"));
    expect(lb.html).toContain("2,205 lb");
  });

  it("free access invite links to sign-up with the invited address", () => {
    const m = freeAccessEmail({ email: "sam+gym@example.com", inviterName: "Ben", note: "Leg day Thursday!", siteUrl: "https://setmodo.com" });
    expect(m.subject).toBe("Ben gave you free access to Setmodo");
    expect(m.html).toContain("https://setmodo.com/sign-in?mode=sign-up&amp;email=sam%2Bgym%40example.com");
    expect(m.html).toContain("“Leg day Thursday!”");
    expect(m.html).toContain("No trial and no payment");
  });
});

describe("launch email", () => {
  it("thanks early users, states the trial end and leads with yearly", async () => {
    const { launchEmail } = await import("@/lib/emails/launch");
    const m = launchEmail({ displayName: "Sam", trialEndsAt: "2026-11-01T12:00:00Z", trialDays: 14, siteUrl: "https://setmodo.com" });
    expect(m.subject).toBe("Setmodo membership is here: your 14 free days start today");
    expect(m.html).toContain("Hi Sam,");
    expect(m.html).toContain("Sunday 1 November");
    expect(m.html).toContain("<strong>£30 a year</strong>");
    expect(m.html).toContain("https://setmodo.com/upgrade");
    expect(m.text).toContain("Nothing you’ve logged will ever be deleted");
  });
});

describe("email footer", () => {
  it("gives the contact address and the company details", () => {
    const m = trialEndingEmail(base);
    expect(m.html).toContain("mailto:hello@setmodo.com");
    expect(m.html).toContain("B A Thompson Ltd");
    expect(m.html).toContain("company no. 09468823");
  });
});

describe("referral reward email", () => {
  it("says the trial got 14 more days and until when", async () => {
    const { referralRewardEmail } = await import("@/lib/emails/referral-reward");
    const m = referralRewardEmail({ displayName: "Sam <b>", trialEndsAt: "2026-11-01T12:00:00Z", siteUrl: "https://setmodo.com" });
    expect(m.subject).toBe("You’ve got 14 more days of Setmodo");
    expect(m.html).toContain("Sunday 1 November");
    expect(m.html).toContain("Sam &lt;b&gt;");
    expect(m.text).toContain("https://setmodo.com/train");
  });
});

describe("trial extended email", () => {
  it("says the trial got 7 more days, until when, and what to do at the gym", async () => {
    const { trialExtendedEmail } = await import("@/lib/emails/trial-extended");
    const ready = trialExtendedEmail({ displayName: "Sam <b> Smith", trialEndsAt: "2026-11-05T12:00:00Z", splitName: "Push / Pull / Legs", workoutName: "Push", siteUrl: "https://setmodo.com" });
    expect(ready.subject).toBe("I’ve added a week to your Setmodo trial");
    expect(ready.html).toContain("Hi Sam,");
    expect(ready.html).toContain("Thursday 5 November");
    expect(ready.html).toContain("start Push");
    expect(ready.html).not.toContain("£");
    expect(ready.text).toContain("https://setmodo.com/train");
    const blank = trialExtendedEmail({ displayName: "<b>", trialEndsAt: "2026-11-05T12:00:00Z", splitName: null, workoutName: null, siteUrl: "https://setmodo.com" });
    expect(blank.html).toContain("Hi &lt;b&gt;,");
    expect(blank.text).toContain("Pick one of the starter splits");
  });
});

describe("first workout email", () => {
  it("points to the waiting workout, or to picking a split", async () => {
    const { firstWorkoutEmail } = await import("@/lib/emails/first-workout");
    const now = new Date("2026-10-15T08:00:00Z");
    const ready = firstWorkoutEmail({ displayName: "Sam <b>", splitName: "Push / Pull / Legs", workoutName: "Push", trialEndsAt: "2026-10-28T08:00:00Z", siteUrl: "https://setmodo.com" }, now);
    expect(ready.subject).toBe("Your Push workout is ready");
    expect(ready.html).toContain("Sam &lt;b&gt;");
    expect(ready.html).toContain("13 days");
    expect(ready.text).toContain("https://setmodo.com/train");
    const blank = firstWorkoutEmail({ displayName: null, splitName: null, workoutName: null, trialEndsAt: null, siteUrl: "https://setmodo.com" }, now);
    expect(ready.html).toContain('src="https://setmodo.com/badges/app-store-black.png"');
    expect(ready.html).toContain("https://apps.apple.com/gb/app/setmodo-workout-tracker/id6830100182");
    expect(ready.text).toContain("On iPhone? Get Setmodo on the App Store");
    expect(blank.subject).toBe("Ready to train? Pick a split in 2 minutes");
    expect(blank.text).not.toContain("trial");
  });
});

describe("first session email", () => {
  it("shows the workout, the best set of each exercise in the member's unit, and the App Store badge", async () => {
    const { firstSessionEmail, bestSetLabel } = await import("@/lib/emails/first-session");
    const now = new Date("2026-11-12T09:00:00Z");
    const m = firstSessionEmail(
      {
        displayName: "Sam <b>Smith</b>",
        workoutName: "Push",
        workingSets: 12,
        exercises: [
          { name: "Bench Press", mode: "weight_reps", weight_kg: "60.00", reps: 8 },
          { name: "Dips", mode: "added_weight_reps", weight_kg: 0, reps: 10 },
        ],
        unit: "kg",
        trialEndsAt: "2026-11-20T09:00:00Z",
        siteUrl: "https://www.setmodo.com",
      },
      now,
    );
    expect(m.subject).toBe("Nice first session 💪");
    expect(m.html).toContain("Hi Sam,");
    expect(m.html).not.toContain("<b>Smith");
    expect(m.html).toContain("12 working sets across 2 exercises");
    expect(m.html).toContain("60 kg × 8");
    expect(m.html).toContain("BW × 10");
    expect(m.html).toContain("8 days");
    expect(m.html).toContain('src="https://www.setmodo.com/badges/app-store-black.png"');
    expect(m.text).toContain("- Bench Press: 60 kg × 8");
    expect(m.text).toContain("https://www.setmodo.com/train");

    expect(bestSetLabel({ name: "Bench", mode: "weight_reps", weight_kg: 100, reps: 5 }, "lb")).toBe("220.46 lb × 5");
    expect(bestSetLabel({ name: "Pull-up", mode: "bodyweight_reps", weight_kg: null, reps: 12 }, "kg")).toBe("12 reps");
    expect(bestSetLabel({ name: "Plank", mode: "duration", weight_kg: null, reps: 45 }, "kg")).toBe("45 s");
    expect(bestSetLabel({ name: "Dip", mode: "added_weight_reps", weight_kg: 10, reps: 6 }, "kg")).toBe("+10 kg × 6");

    const bare = firstSessionEmail({ displayName: null, workoutName: "Quick workout", workingSets: 1, exercises: [], unit: "kg", trialEndsAt: null, siteUrl: "https://www.setmodo.com" }, now);
    expect(bare.text.startsWith("Hi,")).toBe(true);
    expect(bare.text).toContain("1 working set.");
    expect(bare.text).not.toContain("trial");
    expect(bare.html).not.toContain("Next time, beat these");
  });
});

describe("App Store launch announcement", () => {
  it("links to the App Store, greets by first name and escapes it", async () => {
    const { appStoreLaunchEmail } = await import("@/lib/emails/app-store-launch");
    const m = appStoreLaunchEmail({ displayName: "Sam <b>Smith</b>", siteUrl: "https://www.setmodo.com" });
    expect(m.subject).toBe("Setmodo is now on the App Store 📲");
    expect(m.html).toContain("https://apps.apple.com/gb/app/setmodo-workout-tracker/id6830100182");
    expect(m.html).toContain("Hi Sam,");
    expect(m.html).toContain('src="https://www.setmodo.com/badges/app-store-black.png"');
    expect(m.html).toContain('alt="Download on the App Store"');
    expect(m.html).not.toContain("<b>Smith");
    expect(m.text).toContain("Download it here: https://apps.apple.com/gb/app/setmodo-workout-tracker/id6830100182");
    expect(appStoreLaunchEmail({ displayName: null, siteUrl: "https://www.setmodo.com" }).text.startsWith("Hi,")).toBe(true);
  });
});
