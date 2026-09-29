import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

const resolve = (relative: string): string => fileURLToPath(new URL(relative, import.meta.url));

export default defineConfig({
  root: resolve("./"),
  plugins: [react()],
  server: { port: 4174, strictPort: true },
  build: {
    outDir: resolve("./dist"),
    emptyOutDir: true,
    target: "es2022",
    sourcemap: true,
  },
});
