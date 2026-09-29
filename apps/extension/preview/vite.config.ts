import react from "@vitejs/plugin-react";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { defineConfig, type Plugin } from "vite";

const resolve = (relative: string): string => fileURLToPath(new URL(relative, import.meta.url));

/**
 * Serves the real build output (`dist/content.js`) so the harness can load the
 * exact IIFE bundle the browser gets, not the Vite dev transform of the source.
 */
function serveBuiltContent(): Plugin {
  return {
    name: "ai-translator:serve-built-content",
    configureServer(server) {
      server.middlewares.use("/built-content.js", (_request, response, next) => {
        readFile(resolve("../dist/content.js"), "utf8")
          .then((code) => {
            response.setHeader("content-type", "text/javascript");
            response.end(code);
          })
          .catch(next);
      });
    },
  };
}

export default defineConfig({
  root: resolve("./"),
  plugins: [react(), serveBuiltContent()],
  server: { port: 4174, strictPort: true },
  build: {
    outDir: resolve("./dist"),
    emptyOutDir: true,
    target: "es2022",
    sourcemap: true,
  },
});
