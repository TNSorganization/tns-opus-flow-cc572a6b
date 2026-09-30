import { describe, expect, test } from "bun:test";
import { buildAbsoluteAppUrl } from "./app-url";

describe("buildAbsoluteAppUrl", () => {
  const appUrl = "https://tnsorganization.github.io/tns-opus-flow-cc572a6b";

  test("keeps authentication callbacks inside the GitHub Pages app", () => {
    expect(buildAbsoluteAppUrl(appUrl, "callback?intent=recovery")).toBe(
      `${appUrl}/callback?intent=recovery`,
    );
  });

  test("does not let a leading slash discard the repository path", () => {
    expect(buildAbsoluteAppUrl(`${appUrl}/`, "/reset-password")).toBe(`${appUrl}/reset-password`);
  });
});
