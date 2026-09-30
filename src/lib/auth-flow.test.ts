import { describe, expect, test } from "bun:test";
import { hasAuthCallback, parseAuthCallback, passwordIssue } from "./auth-flow";

describe("parseAuthCallback", () => {
  test("recognizes a PKCE password recovery callback", () => {
    expect(
      parseAuthCallback("https://example.com/callback?intent=recovery&code=one-time-code"),
    ).toEqual({
      kind: "pkce",
      intent: "recovery",
      code: "one-time-code",
    });
  });

  test("recognizes a legacy implicit recovery callback", () => {
    expect(
      parseAuthCallback(
        "https://example.com/reset-password#access_token=access&refresh_token=refresh&type=recovery",
      ),
    ).toEqual({
      kind: "implicit",
      intent: "recovery",
      accessToken: "access",
      refreshToken: "refresh",
    });
  });

  test("recognizes a token hash callback", () => {
    expect(
      parseAuthCallback(
        "https://example.com/callback?token_hash=hashed-token&type=recovery&intent=recovery",
      ),
    ).toEqual({
      kind: "otp",
      intent: "recovery",
      tokenHash: "hashed-token",
      otpType: "recovery",
    });
  });

  test("keeps an authentication error readable", () => {
    expect(
      parseAuthCallback("https://example.com/callback?error_description=Link+has+expired"),
    ).toEqual({
      kind: "error",
      intent: "unknown",
      message: "Link has expired",
    });
  });

  test("does not mistake a regular page for a callback", () => {
    expect(hasAuthCallback("https://example.com/auth?email=person@example.com")).toBe(false);
  });
});

describe("passwordIssue", () => {
  test("accepts spaces, symbols, and unicode without rewriting them", () => {
    expect(passwordIssue("  !é🔐 ")).toBeNull();
  });

  test("only rejects values shorter than six characters", () => {
    expect(passwordIssue("a b! ")).toBe("Use at least 6 characters.");
    expect(passwordIssue("a b!  ")).toBeNull();
  });
});
