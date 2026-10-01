import { describe, expect, test } from "bun:test";
import { fromSelectValue, NO_SELECTION_VALUE, toSelectValue } from "./select-value";

describe("nullable select values", () => {
  test("uses a non-empty sentinel for Radix Select", () => {
    expect(toSelectValue(null)).toBe(NO_SELECTION_VALUE);
    expect(toSelectValue("")).toBe(NO_SELECTION_VALUE);
  });

  test("preserves real values and converts the sentinel back to null", () => {
    expect(toSelectValue("weekly")).toBe("weekly");
    expect(fromSelectValue("weekly")).toBe("weekly");
    expect(fromSelectValue(NO_SELECTION_VALUE)).toBeNull();
  });
});
