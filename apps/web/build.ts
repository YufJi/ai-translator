import { cp, mkdir, rm } from "node:fs/promises";
import { watch } from "node:fs";
import { fileURLToPath } from "node:url";

const root = new URL("./", import.meta.url);
const outdir = fileURLToPath(new URL("./dist/", root));
const serve = process.argv.includes("--serve");
const useWatch = process.argv.includes("--watch") || serve;
const port = Number(process.env.PORT ?? 4173);

async function build(): Promise<void> {
  await rm(outdir, { recursive: true, force: true });
  await mkdir(outdir, { recursive: true });
  const result = await Bun.build({
    entrypoints: [fileURLToPath(new URL("./index.html", root))],
    outdir,
    target: "browser",
    minify: !useWatch,
    sourcemap: useWatch ? "inline" : "none",
    define: { "process.env.NODE_ENV": JSON.stringify(useWatch ? "development" : "production") },
  });
  if (!result.success) {
    for (const log of result.logs) console.error(log);
    throw new Error("web build failed");
  }
  await cp(fileURLToPath(new URL("./public/", root)), outdir, { recursive: true }).catch(() => {});
  console.log(`[web] built ${result.outputs.length} files → ${outdir}`);
}

await build();

if (useWatch) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  for (const target of ["../../packages", "./src", "./index.html"]) {
    watch(fileURLToPath(new URL(target, root)), { recursive: true }, () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        build().catch((error) => console.error("[web] rebuild failed:", error.message));
      }, 80);
    });
  }
}

if (serve) {
  Bun.serve({
    port,
    async fetch(request) {
      const url = new URL(request.url);
      const path = url.pathname === "/" ? "/index.html" : url.pathname;
      const file = Bun.file(`${outdir}${path}`);
      if (await file.exists()) return new Response(file);
      const fallback = Bun.file(`${outdir}/index.html`);
      return (await fallback.exists())
        ? new Response(fallback, { headers: { "content-type": "text/html; charset=utf-8" } })
        : new Response("Not found", { status: 404 });
    },
  });
  console.log(`[web] dev server → http://localhost:${port}`);
}
