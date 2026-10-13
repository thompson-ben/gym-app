import { describe, expect, it } from "vitest";
import { CONSENT_MAX_AGE_MS, parseConsent, serializeConsent, shouldAsk } from "@/lib/consent";

describe("ad-measurement consent", () => {
  const now = 1_800_000_000_000;

  it("remembers a choice for six months, then asks again", () => {
    expect(parseConsent(serializeConsent("granted", now), now)).toBe("granted");
    expect(parseConsent(serializeConsent("denied", now), now + 1000)).toBe("denied");
    expect(parseConsent(serializeConsent("granted", now), now + CONSENT_MAX_AGE_MS + 1)).toBeNull();
    expect(parseConsent(null, now)).toBeNull();
    expect(parseConsent("yes", now)).toBeNull();
    expect(parseConsent("granted:abc", now)).toBeNull();
  });

  it("asks only on public pages, with a pixel, no choice yet and no browser opt-out", () => {
    const base = { pixelId: "123", consent: null, optOutSignal: false, publicPage: true } as const;
    expect(shouldAsk(base)).toBe(true);
    expect(shouldAsk({ ...base, pixelId: undefined })).toBe(false);
    expect(shouldAsk({ ...base, consent: "denied" })).toBe(false);
    expect(shouldAsk({ ...base, consent: "granted" })).toBe(false);
    expect(shouldAsk({ ...base, optOutSignal: true })).toBe(false);
    expect(shouldAsk({ ...base, publicPage: false })).toBe(false);
  });
});
