import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import { test } from "node:test";

const manifestUrl = new URL("../manifest.json", import.meta.url);
const distUrl = new URL("../dist/", import.meta.url);

interface Manifest {
  manifest_version: number;
  name: string;
  version: string;
  description?: string;
  permissions: string[];
  host_permissions: string[];
  background: { service_worker: string; type?: string };
  action: { default_popup: string };
  options_page: string;
  icons: Record<string, string>;
  content_scripts: { matches: string[]; js: string[]; run_at?: string }[];
  commands: Record<string, { suggested_key?: Record<string, string>; description?: string }>;
}

async function readManifest(): Promise<Manifest> {
  return JSON.parse(await readFile(manifestUrl, "utf8")) as Manifest;
}

test("manifest declares a valid MV3 extension surface", async () => {
  const manifest = await readManifest();
  assert.equal(manifest.manifest_version, 3);
  assert.ok(manifest.name.length > 0);
  assert.match(manifest.version, /^\d+\.\d+\.\d+$/u);
  assert.equal(manifest.background.service_worker, "background.js");
  assert.ok(
    manifest.background.type === undefined || manifest.background.type === "module",
    "background.type must be omitted or set to module",
  );
  assert.equal(manifest.action.default_popup, "popup.html");
  assert.equal(manifest.options_page, "options.html");
  assert.ok(manifest.permissions.includes("storage"));
  assert.ok(manifest.permissions.includes("contextMenus"));
  assert.ok(manifest.permissions.includes("scripting"));
  assert.ok(manifest.host_permissions.includes("<all_urls>"));
});

test("content script is scoped to http(s) pages and injects the bundle", async () => {
  const manifest = await readManifest();
  const script = manifest.content_scripts[0]!;
  assert.deepEqual(script.js, ["content.js"]);
  assert.ok(script.matches.every((pattern) => pattern.startsWith("http")));
  assert.equal(script.run_at, "document_idle");
});

test("keyboard shortcut is declared for the selection flow", async () => {
  const manifest = await readManifest();
  const command = manifest.commands["translate-selection"];
  assert.ok(command, "translate-selection command must exist");
  assert.equal(command.suggested_key?.default, "Alt+Shift+T");
});

test("declared icons exist and are square PNGs of the right size", async () => {
  const manifest = await readManifest();
  for (const [size, relative] of Object.entries(manifest.icons)) {
    const bytes = await readFile(new URL(`../${relative}`, import.meta.url));
    assert.deepEqual(
      [...bytes.subarray(0, 8)],
      [137, 80, 78, 71, 13, 10, 26, 10],
      `${relative} is not a PNG`,
    );
    assert.equal(bytes.readUInt32BE(16), Number(size), `${relative} width`);
    assert.equal(bytes.readUInt32BE(20), Number(size), `${relative} height`);
  }
});

test("every artifact referenced by the manifest is produced by a build", async (t) => {
  const manifest = await readManifest();
  let built = true;
  try {
    await stat(distUrl);
  } catch {
    built = false;
  }
  if (!built) {
    t.skip("run `npm run build:extension` to validate build artifacts");
    return;
  }
  const expected = [
    "manifest.json",
    manifest.background.service_worker,
    manifest.action.default_popup,
    manifest.options_page,
    ...manifest.content_scripts.flatMap((script) => script.js),
    ...Object.values(manifest.icons),
  ];
  for (const relative of expected) {
    await stat(new URL(`../dist/${relative}`, import.meta.url));
  }
  const manifestCopy = JSON.parse(await readFile(new URL("../dist/manifest.json", import.meta.url), "utf8"));
  assert.deepEqual(manifestCopy, manifest, "dist manifest must match the source manifest");
});

test("content and background bundles stay classic-script compatible", async (t) => {
  try {
    await stat(distUrl);
  } catch {
    t.skip("run `npm run build:extension` to validate the bundles");
    return;
  }
  for (const file of ["content.js", "background.js"]) {
    const code = await readFile(new URL(`../dist/${file}`, import.meta.url), "utf8");
    assert.doesNotMatch(code, /^\s*(?:import|export)[\s{(]/mu, `${file} must not use ESM syntax`);
    assert.ok(code.length > 500, `${file} looks empty`);
  }
});

test("bundles avoid node-only globals that would crash on load", async (t) => {
  try {
    await stat(distUrl);
  } catch {
    t.skip("run `npm run build:extension` to validate the bundles");
    return;
  }
  for (const file of ["content.js", "background.js"]) {
    const code = await readFile(new URL(`../dist/${file}`, import.meta.url), "utf8");
    assert.doesNotMatch(code, /process\.env/u, `${file} references process.env (lib builds must define it)`);
    assert.doesNotMatch(code, /\brequire\(/u, `${file} references require()`);
  }
});

test("popup and options pages load a bundled script", async (t) => {
  try {
    await stat(distUrl);
  } catch {
    t.skip("run `npm run build:extension` to validate the pages");
    return;
  }
  for (const page of ["popup.html", "options.html"]) {
    const html = await readFile(new URL(`../dist/${page}`, import.meta.url), "utf8");
    const src = /<script[^>]+src="([^"]+)"/u.exec(html)?.[1];
    assert.ok(src, `${page} must reference a bundled script`);
    await stat(new URL(`../dist/${src.replace(/^\.?\//u, "")}`, import.meta.url));
  }
});
