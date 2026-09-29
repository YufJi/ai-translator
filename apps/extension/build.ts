import { cp, mkdir, rm } from "node:fs/promises";
import { watch } from "node:fs";
import { fileURLToPath } from "node:url";
import { generateIcons } from "./scripts/make-icons.ts";

const root = new URL("./", import.meta.url);
const outdir = fileURLToPath(new URL("./dist/", root));
const useWatch = process.argv.includes("--watch");

async function build(): Promise<void> {
  await generateIcons();
  await rm(outdir, { recursive: true, force: true });
  await mkdir(outdir, { recursive: true });

  const pages = await Bun.build({
    entrypoints: [
      fileURLToPath(new URL("./popup.html", root)),
      fileURLToPath(new URL("./options.html", root)),
    ],
    outdir,
    target: "browser",
    minify: !useWatch,
    sourcemap: useWatch ? "inline" : "none",
    naming: { chunk: "chunks/[name]-[hash].[ext]", asset: "assets/[name]-[hash].[ext]" },
  });
  const scripts = await Bun.build({
    entrypoints: [
      fileURLToPath(new URL("./src/background.ts", root)),
      fileURLToPath(new URL("./src/content.ts", root)),
    ],
    outdir,
    target: "browser",
    format: "esm",
    minify: !useWatch,
    sourcemap: "none",
    naming: "[name].js",
  });

  for (const result of [pages, scripts]) {
    if (!result.success) {
      for (const log of result.logs) console.error(log);
      throw new Error("extension build failed");
    }
  }

  await cp(fileURLToPath(new URL("./manifest.json", root)), `${outdir}/manifest.json`);
  await cp(fileURLToPath(new URL("./icons/", root)), `${outdir}/icons`, { recursive: true });
  console.log(`[extension] built ${pages.outputs.length + scripts.outputs.length} bundles → ${outdir}`);
}

await build();

if (useWatch) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  for (const target of ["./src", "./manifest.json", "./popup.html", "./options.html", "../../packages"]) {
    watch(fileURLToPath(new URL(target, root)), { recursive: true }, () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        build().catch((error) => console.error("[extension] rebuild failed:", error.message));
      }, 80);
    });
  }
  console.log("[extension] watching for changes…");
}
