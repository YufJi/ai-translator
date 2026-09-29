import { mkdir, rm } from "node:fs/promises";
import { watch } from "node:fs";
import { fileURLToPath } from "node:url";
import { startStaticServer } from "../../serve.ts";

const root = new URL("./", import.meta.url);
const outdir = fileURLToPath(new URL("./dist/", root));
const port = Number(process.env.PREVIEW_PORT ?? 4174);

async function build(): Promise<void> {
  await rm(outdir, { recursive: true, force: true });
  await mkdir(outdir, { recursive: true });
  const result = await Bun.build({
    entrypoints: [
      fileURLToPath(new URL("./index.html", root)),
      fileURLToPath(new URL("./popup.html", root)),
      fileURLToPath(new URL("./options.html", root)),
      fileURLToPath(new URL("./content.html", root)),
    ],
    outdir,
    target: "browser",
    minify: false,
    sourcemap: "inline",
    naming: { chunk: "chunks/[name]-[hash].[ext]", asset: "assets/[name]-[hash].[ext]" },
  });
  if (!result.success) {
    for (const log of result.logs) console.error(log);
    throw new Error("extension preview build failed");
  }
  console.log(`[extension-preview] built ${result.outputs.length} files → ${outdir}`);
}

await build();
startStaticServer({ outdir, port });
console.log(`[extension-preview] → http://localhost:${port}`);

let timer: ReturnType<typeof setTimeout> | undefined;
for (const target of ["./entries", "../src", "./preview.css", "./index.html", "../../../packages"]) {
  watch(fileURLToPath(new URL(target, root)), { recursive: true }, () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      build().catch((error) => console.error("[extension-preview] rebuild failed:", error.message));
    }, 80);
  });
}

