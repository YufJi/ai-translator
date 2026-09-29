import assert from "node:assert/strict";
import { test } from "node:test";
import {
  CONFIG_VERSION,
  DEFAULT_SETTINGS,
  defaultConfig,
  exportConfigJson,
  mergeConfig,
  mergeSettings,
  parseConfig,
  redactConfig,
  resolveActiveProvider,
  validateConfig,
  type AppConfig,
} from "../src/config.ts";
import {
  CONFIG_STORAGE_KEY,
  LocalStorageConfigStore,
  MemoryConfigStore,
  type StorageLike,
} from "../src/storage.ts";

function baseConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  return {
    version: CONFIG_VERSION,
    providers: [
      { id: "openai", kind: "openai-compatible", model: "gpt-4o-mini", apiKey: "sk-secret" },
      { id: "mock", kind: "mock", model: "mock-1" },
    ],
    activeProviderId: "openai",
    settings: structuredClone(DEFAULT_SETTINGS),
    ...overrides,
  };
}

test("default config is valid and ships an offline provider", () => {
  const config = defaultConfig();
  const result = validateConfig(config);
  assert.equal(result.ok, true);
  assert.equal(result.config.activeProviderId, "mock");
  assert.equal(result.config.providers[0]?.kind, "mock");
  assert.equal(result.config.settings.targetLanguage, "zh-Hans");
});

test("reports structural problems instead of throwing", () => {
  const result = validateConfig({
    version: 1,
    providers: [
      { id: "a", kind: "nope", model: "m" },
      { id: "b", kind: "openai-compatible" },
      { id: "c", kind: "openai-compatible", model: "m" },
      { id: "c", kind: "mock", model: "mock-1" },
      "not-an-object",
    ],
    settings: { targetLanguage: "klingon", glossary: [{ source: "a" }] },
  });
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((error) => error.includes("kind must be one of")));
  assert.ok(result.errors.some((error) => error.includes("model is required")));
  assert.ok(result.errors.some((error) => error.includes("duplicated")));
  assert.ok(result.errors.some((error) => error.includes("must be an object")));
  assert.ok(result.errors.some((error) => error.includes("not a supported language")));
  assert.ok(result.errors.some((error) => error.includes("needs both source and target")));
});

test("normalizes language aliases and clamps numeric settings", () => {
  const result = validateConfig({
    version: 1,
    providers: [{ id: "p", kind: "mock", model: "mock-1" }],
    activeProviderId: "p",
    settings: {
      sourceLanguage: "zh",
      targetLanguage: "en",
      fallbackSourceLanguage: "ja",
      temperature: 9,
      chunkSize: 10_000_000,
      detectConfidenceThreshold: 5,
      cache: { enabled: false, maxEntries: 5_000_000 },
    },
  });
  const { settings } = result.config;
  assert.equal(settings.sourceLanguage, "zh-Hans");
  assert.equal(settings.targetLanguage, "en-US");
  assert.equal(settings.fallbackSourceLanguage, "ja");
  assert.equal(settings.temperature, DEFAULT_SETTINGS.temperature);
  assert.equal(settings.chunkSize, DEFAULT_SETTINGS.chunkSize);
  assert.equal(settings.detectConfidenceThreshold, DEFAULT_SETTINGS.detectConfidenceThreshold);
  assert.equal(settings.cache.enabled, false);
  assert.equal(settings.cache.maxEntries, DEFAULT_SETTINGS.cache.maxEntries);
});

test("repoints the active provider when it is missing", () => {
  const result = validateConfig({
    version: 1,
    providers: [{ id: "mock", kind: "mock", model: "mock-1" }],
    activeProviderId: "ghost",
    settings: {},
  });
  assert.equal(result.config.activeProviderId, "mock");
  assert.ok(result.warnings.some((warning) => warning.includes("ghost")));
});

test("warns about legacy config versions", () => {
  const result = validateConfig({
    version: 0,
    providers: [{ id: "mock", kind: "mock", model: "mock-1" }],
    settings: {},
  });
  assert.ok(result.warnings.some((warning) => warning.includes("migrated")));
  assert.equal(result.config.version, CONFIG_VERSION);
});

test("parses json strings and survives malformed input", () => {
  assert.equal(parseConfig(JSON.stringify(baseConfig())).ok, true);
  const broken = parseConfig("{ not json");
  assert.equal(broken.ok, false);
  assert.match(broken.errors[0]!, /not valid JSON/);
  assert.equal(broken.config.version, CONFIG_VERSION);
});

test("merges patches without dropping providers", () => {
  const base = validateConfig(baseConfig()).config;
  const merged = mergeConfig(base, { settings: { tone: "formal" } as never });
  assert.equal(merged.config.settings.tone, "formal");
  assert.equal(merged.config.providers.length, 2);
  assert.equal(mergeSettings(base.settings, { targetLanguage: "ja" }).targetLanguage, "ja");
});

test("redacts secrets for sharing", () => {
  const config = validateConfig(baseConfig()).config;
  assert.equal(redactConfig(config).providers[0]?.apiKey, "***");
  assert.ok(!exportConfigJson(config, { includeSecrets: false }).includes("sk-secret"));
  assert.ok(exportConfigJson(config).includes("sk-secret"));
});

test("resolveActiveProvider prefers the requested id then any enabled provider", () => {
  const config = validateConfig(baseConfig()).config;
  assert.equal(resolveActiveProvider(config)?.id, "openai");
  assert.equal(resolveActiveProvider(config, "mock")?.id, "mock");
  assert.equal(resolveActiveProvider(config, "ghost")?.id, "openai");
  const noActive = validateConfig({
    version: 1,
    providers: [
      { id: "off", kind: "mock", model: "mock-1", enabled: false },
      { id: "on", kind: "mock", model: "mock-1" },
    ],
    settings: {},
  }).config;
  assert.equal(resolveActiveProvider(noActive)?.id, "on");
});

test("memory store round trips and notifies subscribers", () => {
  const store = new MemoryConfigStore();
  const seen: string[] = [];
  const unsubscribe = store.subscribe((config) => seen.push(config.settings.tone));
  store.save({ ...store.load(), settings: { ...store.load().settings, tone: "formal" } });
  assert.equal(store.load().settings.tone, "formal");
  assert.deepEqual(seen, ["formal"]);
  unsubscribe();
  store.save({ ...store.load(), settings: { ...store.load().settings, tone: "academic" } });
  assert.deepEqual(seen, ["formal"]);
  assert.equal(store.reset().settings.tone, DEFAULT_SETTINGS.tone);
});

test("local storage store persists, ignores corrupt payloads and resets", () => {
  const backing = new Map<string, string>();
  const storage: StorageLike = {
    getItem: (key) => backing.get(key) ?? null,
    setItem: (key, value) => void backing.set(key, value),
    removeItem: (key) => void backing.delete(key),
  };
  const store = new LocalStorageConfigStore(storage);
  store.save({ ...store.load(), activeProviderId: "mock", settings: { ...store.load().settings, tone: "marketing" } });
  assert.ok(backing.has(CONFIG_STORAGE_KEY));
  assert.equal(new LocalStorageConfigStore(storage).load().settings.tone, "marketing");

  backing.set(CONFIG_STORAGE_KEY, "{{{");
  assert.equal(new LocalStorageConfigStore(storage).load().settings.tone, DEFAULT_SETTINGS.tone);

  store.reset();
  assert.equal(backing.has(CONFIG_STORAGE_KEY), false);
});

