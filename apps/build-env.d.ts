interface BunBuildArtifact {
  path: string;
  kind: string;
}

interface BunBuildResult {
  success: boolean;
  outputs: BunBuildArtifact[];
  logs: unknown[];
}

interface BunBuildNaming {
  entry?: string;
  chunk?: string;
  asset?: string;
}

interface BunBuildOptions {
  entrypoints: string[];
  outdir: string;
  target?: "browser" | "bun" | "node";
  format?: "esm" | "cjs" | "iife";
  minify?: boolean;
  sourcemap?: "none" | "inline" | "external" | "linked";
  naming?: string | BunBuildNaming;
  define?: Record<string, string>;
  splitting?: boolean;
}

interface BunFileLike extends Blob {
  exists(): Promise<boolean>;
  readonly name?: string;
}

declare const Bun: {
  build(options: BunBuildOptions): Promise<BunBuildResult>;
  file(path: string | URL): BunFileLike;
  write(path: string | URL, data: Uint8Array | string): Promise<number>;
  serve(options: {
    port: number;
    fetch(request: Request): Response | Promise<Response>;
  }): unknown;
};

interface ImportMeta {
  readonly main?: boolean;
}

