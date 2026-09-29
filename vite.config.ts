import { fileURLToPath, URL } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { nitro } from "nitro/vite";
import { defineConfig } from "vite";

const isGitHubPages = process.env.GITHUB_PAGES === "true";
const repositoryName = process.env.GITHUB_REPOSITORY?.split("/")[1] ?? "tns-opus-flow-cc572a6b";
const pagesBasePath = isGitHubPages ? `/${repositoryName}` : "";

export default defineConfig({
  base: pagesBasePath ? `${pagesBasePath}/` : "/",
  plugins: [
    tailwindcss(),
    tanstackStart({
      importProtection: {
        behavior: "error",
        client: {
          files: ["**/server/**"],
          specifiers: ["server-only"],
        },
      },
      server: { entry: "server" },
      router: pagesBasePath ? { basepath: pagesBasePath } : {},
      spa: isGitHubPages
        ? {
            enabled: true,
            maskPath: "/",
            prerender: { outputPath: "/index" },
          }
        : undefined,
    }),
    ...(isGitHubPages ? [] : [nitro({ defaultPreset: "cloudflare-module" })]),
    viteReact(),
  ],
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
    dedupe: ["react", "react-dom", "@tanstack/react-query", "@tanstack/query-core"],
    tsconfigPaths: true,
  },
  server: {
    host: "::",
    port: 8080,
  },
});
