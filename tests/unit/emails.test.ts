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
    expect(blank.subject).toBe("Ready to train? Pick a split in 2 minutes");
    expect(blank.text).not.toContain("trial");
  });
});
