// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - tanstackStart, viteReact, tailwindcss, tsConfigPaths, nitro (build-only using cloudflare as a default target),
//     componentTagger (dev-only), VITE_* env injection, @ path alias, React/TanStack dedupe,
//     error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

const isGitHubPages = process.env.GITHUB_PAGES === "true";
const repositoryName = process.env.GITHUB_REPOSITORY?.split("/")[1] ?? "tns-opus-flow-cc572a6b";
const pagesBasePath = isGitHubPages ? `/${repositoryName}` : "";

export default defineConfig({
  nitro: isGitHubPages ? false : undefined,
  vite: {
    base: pagesBasePath ? `${pagesBasePath}/` : "/",
  },
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
    router: pagesBasePath ? { basepath: pagesBasePath } : {},
    spa: isGitHubPages
      ? {
          enabled: true,
          maskPath: "/",
          prerender: { outputPath: "/index" },
        }
      : undefined,
  },
});
