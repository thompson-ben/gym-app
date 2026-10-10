import { describe, expect, it } from "vitest";
import { freeAccessEmail } from "@/lib/emails/free-access";
import { trialEndingEmail } from "@/lib/emails/trial-ending";

const base = { displayName: "Ben", trialEndsAt: "2026-10-09T12:00:00Z", unit: "kg" as const, workouts: 6, workingSets: 84, volumeKg: 12450, siteUrl: "https://notchlift.com" };

describe("emails", () => {
  it("trial ending: countdown, progress so far, and the yearly offer first", () => {
    const m = trialEndingEmail(base, new Date("2026-10-07T12:00:00Z"));
    expect(m.subject).toBe("Your NotchLift trial ends in 2 days");
    expect(m.html).toContain("Hi Ben,");
    expect(m.html).toContain("<strong>6 workouts</strong>");
    expect(m.html).toContain("<strong>12,450 kg</strong>");
    expect(m.html).toContain("Keep training for £30 a year");
    expect(m.html).toContain("£2.50 a month");
    expect(m.html).toContain("37% less");
    expect(m.html).toContain("https://notchlift.com/upgrade?plan=yearly");
    expect(m.html).toContain("Or £3.99 a month");
    expect(m.text).toContain("nothing is deleted");
  });

  it("trial ending: pounds, tomorrow, no workouts yet, and names are escaped", () => {
    const m = trialEndingEmail({ ...base, displayName: "<b>Sam</b>", unit: "lb", workouts: 0, workingSets: 0, volumeKg: 0, trialEndsAt: "2026-10-08T10:00:00Z" }, new Date("2026-10-07T12:00:00Z"));
    expect(m.subject).toBe("Your NotchLift trial ends tomorrow");
    expect(m.html).toContain("Hi &lt;b&gt;Sam&lt;/b&gt;,");
    expect(m.html).not.toContain("<b>Sam</b>");
    expect(m.html).toContain("You haven’t logged a workout yet");
    const lb = trialEndingEmail({ ...base, unit: "lb", volumeKg: 1000 }, new Date("2026-10-07T12:00:00Z"));
    expect(lb.html).toContain("2,205 lb");
  });

  it("free access invite links to sign-up with the invited address", () => {
    const m = freeAccessEmail({ email: "sam+gym@example.com", inviterName: "Ben", note: "Leg day Thursday!", siteUrl: "https://notchlift.com" });
    expect(m.subject).toBe("Ben gave you free access to NotchLift");
    expect(m.html).toContain("https://notchlift.com/sign-in?mode=sign-up&amp;email=sam%2Bgym%40example.com");
    expect(m.html).toContain("“Leg day Thursday!”");
    expect(m.html).toContain("No trial and no payment");
  });
});

describe("launch email", () => {
  it("thanks early users, states the trial end and leads with yearly", async () => {
    const { launchEmail } = await import("@/lib/emails/launch");
    const m = launchEmail({ displayName: "Sam", trialEndsAt: "2026-11-01T12:00:00Z", trialDays: 14, siteUrl: "https://notchlift.com" });
    expect(m.subject).toBe("NotchLift membership is here: your 14 free days start today");
    expect(m.html).toContain("Hi Sam,");
    expect(m.html).toContain("Sunday 1 November");
    expect(m.html).toContain("<strong>£30 a year</strong>");
    expect(m.html).toContain("https://notchlift.com/upgrade");
    expect(m.text).toContain("Nothing you’ve logged will ever be deleted");
  });
});
