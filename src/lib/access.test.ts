import { describe, expect, test } from "bun:test";
import { isTrustedOwnerEmail, normalizeEmail, TRUSTED_OWNER_EMAIL } from "./access";

describe("trusted owner access", () => {
  test("matches the exact TNS owner email without case or surrounding-space sensitivity", () => {
    expect(isTrustedOwnerEmail(`  ${TRUSTED_OWNER_EMAIL.toUpperCase()}  `)).toBe(true);
  });

  test("does not grant owner access to lookalike addresses", () => {
    expect(isTrustedOwnerEmail("tnsorganization+owner@gmail.com")).toBe(false);
    expect(isTrustedOwnerEmail("tnsorganization@gmail.com.example.org")).toBe(false);
    expect(isTrustedOwnerEmail()).toBe(false);
  });

  test("normalizes regular account emails consistently", () => {
    expect(normalizeEmail("  Member@Example.com ")).toBe("member@example.com");
  });
});
