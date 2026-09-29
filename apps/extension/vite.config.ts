import react from "@vitejs/plugin-react";
import { cp, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { defineConfig, type Plugin, type UserConfig } from "vite";

const resolve = (relative: string): string => fileURLToPath(new URL(relative, import.meta.url));
const dist = resolve("./dist/");

/** Copies the manifest and generated icons next to the bundles. */
function staticAssets(): Plugin {
  return {
    name: "ai-translator:static-assets",
    async closeBundle() {
      await mkdir(dist, { recursive: true });
      await cp(resolve("./manifest.json"), `${dist}manifest.json`);
      await cp(resolve("./icons"), `${dist}icons`, { recursive: true });
    },
  };
}

const shared: UserConfig = {
  // lib/IIFE builds do not get Vite's automatic NODE_ENV replacement, and React
  // reads process.env.NODE_ENV -> without this the content script dies on load.
  define: { "process.env.NODE_ENV": JSON.stringify("production") },
  build: {
    target: "es2022",
    minify: true,
    sourcemap: true,
    outDir: dist,
    emptyOutDir: false,
  },
};

/** Content scripts and service workers ship as self-contained IIFE bundles. */
function selfContained(entry: string, name: string, fileName: string): UserConfig {
  return {
    ...shared,
    build: {
      ...shared.build,
      lib: { entry: resolve(entry), formats: ["iife"], name, fileName: () => fileName },
      rollupOptions: { output: { inlineDynamicImports: true } },
    },
  };
}

/** pages | background | content — one Vite run per target keeps every output format clean. */
const target = process.env.BUILD_TARGET ?? "pages";

export default defineConfig(
  target === "background"
    ? selfContained("./src/background.ts", "AiTranslatorBackground", "background.js")
    : target === "content"
      ? selfContained("./src/content.tsx", "AiTranslatorContent", "content.js")
      : {
          ...shared,
          plugins: [react(), staticAssets()],
          build: {
            ...shared.build,
            rollupOptions: {
              input: { popup: resolve("./popup.html"), options: resolve("./options.html") },
              output: {
                entryFileNames: "assets/[name]-[hash].js",
                chunkFileNames: "assets/[name]-[hash].js",
                assetFileNames: "assets/[name]-[hash][extname]",
              },
            },
          },
        },
);
