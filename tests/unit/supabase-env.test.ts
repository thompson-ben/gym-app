import { describe, expect, it } from "vitest";
import { authCookieOptions } from "@/lib/supabase/env";

describe("sign-in cookie name", () => {
  it("keeps production's original cookie on api.notchlift.com, so nobody is signed out", () => {
    expect(authCookieOptions("https://api.notchlift.com")).toEqual({ name: "sb-ffrufyxoqjzijzqsbntm-auth-token" });
  });

  it("leaves Supabase's default everywhere else", () => {
    // The default for these is already sb-ffrufyxoqjzijzqsbntm-auth-token / sb-127-auth-token.
    expect(authCookieOptions("https://ffrufyxoqjzijzqsbntm.supabase.co")).toBeUndefined();
    expect(authCookieOptions("http://127.0.0.1:54321")).toBeUndefined();
  });
});
