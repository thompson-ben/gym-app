import { describe, expect, it } from "vitest";
import { appleDisplayName, isAppleCancel, randomNonce, sha256Hex } from "@/lib/native-apple";

describe("native Sign in with Apple helpers", () => {
  it("hashes the nonce as lower-case hex SHA-256", async () => {
    expect(await sha256Hex("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
    const nonce = randomNonce();
    expect(nonce).toMatch(/^[0-9a-f]{64}$/);
    expect(randomNonce()).not.toBe(nonce);
  });

  it("tells a cancelled sheet from a failure", () => {
    expect(isAppleCancel(new Error("The operation couldn’t be completed. (com.apple.AuthenticationServices.AuthorizationError error 1001.)"))).toBe(true);
    expect(isAppleCancel("User cancelled")).toBe(true);
    expect(isAppleCancel(new Error("error 1000"))).toBe(false);
  });

  it("builds the profile name Apple shares the first time", () => {
    expect(appleDisplayName(" Sam ", " Smith")).toBe("Sam Smith");
    expect(appleDisplayName("Sam", null)).toBe("Sam");
    expect(appleDisplayName("  ", null)).toBeNull();
    expect(appleDisplayName("a".repeat(70), null)).toHaveLength(60);
  });
});
