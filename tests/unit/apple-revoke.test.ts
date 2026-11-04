import { generateKeyPairSync, verify } from "node:crypto";
import { describe, expect, it } from "vitest";
import { appleClientSecret, normalisePrivateKey } from "@/lib/apple-revoke";

describe("Sign in with Apple revocation", () => {
  const { privateKey, publicKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
  const pem = privateKey.export({ type: "pkcs8", format: "pem" }).toString();

  it("signs an ES256 client secret Apple can verify", () => {
    const jwt = appleClientSecret({ teamId: "TEAM123456", keyId: "KEY1234567", privateKey: pem, clientId: "com.notchlift.app", now: 1_800_000_000_000 });
    const [h, c, s] = jwt.split(".");
    expect(JSON.parse(Buffer.from(h, "base64url").toString())).toEqual({ alg: "ES256", kid: "KEY1234567" });
    expect(JSON.parse(Buffer.from(c, "base64url").toString())).toEqual({
      iss: "TEAM123456", iat: 1_800_000_000, exp: 1_800_000_300, aud: "https://appleid.apple.com", sub: "com.notchlift.app",
    });
    expect(verify("sha256", Buffer.from(`${h}.${c}`), { key: publicKey, dsaEncoding: "ieee-p1363" }, Buffer.from(s, "base64url"))).toBe(true);
  });

  it("accepts the key pasted with \\n escapes", () => {
    expect(normalisePrivateKey(pem.replace(/\n/g, "\\n"))).toBe(pem.trim());
    expect(() => appleClientSecret({ teamId: "T", keyId: "K", privateKey: pem.replace(/\n/g, "\\n"), clientId: "x" })).not.toThrow();
  });
});
