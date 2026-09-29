export interface StaticServerOptions {
  outdir: string;
  port: number;
  fallback?: string;
}

export function startStaticServer(options: StaticServerOptions): void {
  const fallbackName = options.fallback ?? "index.html";
  Bun.serve({
    port: options.port,
    async fetch(request) {
      const path = new URL(request.url).pathname;
      const file = Bun.file(`${options.outdir}${path === "/" ? `/${fallbackName}` : path}`);
      if (await file.exists()) return new Response(file);
      const fallback = Bun.file(`${options.outdir}/${fallbackName}`);
      return (await fallback.exists())
        ? new Response(fallback, { headers: { "content-type": "text/html; charset=utf-8" } })
        : new Response("Not found", { status: 404 });
    },
  });
}

