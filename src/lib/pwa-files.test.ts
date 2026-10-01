import { describe, expect, test } from "bun:test";

describe("installable app files", () => {
  test("publishes an installable manifest", async () => {
    const manifest = await Bun.file(
      new URL("../../public/manifest.webmanifest", import.meta.url),
    ).json();

    expect(manifest.display).toBe("standalone");
    expect(manifest.start_url).toBe("./");
    expect(manifest.icons.some((icon: { sizes: string }) => icon.sizes === "192x192")).toBe(true);
    expect(manifest.icons.some((icon: { sizes: string }) => icon.sizes === "512x512")).toBe(true);
  });

  test("keeps navigation fresh while providing an offline shell", async () => {
    const worker = await Bun.file(new URL("../../public/sw.js", import.meta.url)).text();

    expect(worker).toContain("networkFirstNavigation");
    expect(worker).toContain("tns-opus-");
    expect(worker).not.toContain("self.registration.unregister");
  });
});
