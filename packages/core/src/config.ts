import { AUTO_LANGUAGE, type LanguageTag, resolveLanguage } from "./language.ts";
import { TONES, type GlossaryEntry, type Tone } from "./prompt.ts";
import type { ProviderKind } from "./providers/types.ts";

export const CONFIG_VERSION = 1 as const;

export const PROVIDER_KINDS: readonly ProviderKind[] = [
  "openai-compatible",
  "anthropic",
  "google",
  "mock",
];

export type DetectStrategy = "heuristic" | "llm" | "hybrid";
export type BatchMode = "segment" | "json";

export interface ProviderConfig {
  id: string;
  kind: ProviderKind;
  model: string;
  presetId?: string;
  label?: string;
  baseUrl?: string;
  apiKey?: string;
  path?: string;
  modelsPath?: string;
  apiKeyHeader?: string;
  apiKeyPrefix?: string;
  headers?: Record<string, string>;
  body?: Record<string, unknown>;
  timeoutMs?: number;
  streamUsage?: boolean;
  enabled?: boolean;
}

export interface CacheSettings {
  enabled: boolean;
  maxEntries: number;
  ttlMs?: number;
}

export interface TranslationSettings {
  sourceLanguage: LanguageTag | typeof AUTO_LANGUAGE;
  targetLanguage: LanguageTag;
  autoDetect: boolean;
  fallbackSourceLanguage: LanguageTag;
  detectStrategy: DetectStrategy;
  detectConfidenceThreshold: number;
  skipSameLanguage: boolean;
  tone: Tone;
  domain?: string;
  audience?: string;
  glossary: GlossaryEntry[];
  preserveFormatting: boolean;
  temperature: number;
  maxTokens?: number;
  chunkSize: number;
  batchMode: BatchMode;
  cache: CacheSettings;
  systemPromptOverride?: string;
  requestTimeoutMs: number;
}

export interface AppConfig {
  version: typeof CONFIG_VERSION;
  providers: ProviderConfig[];
  activeProviderId: string | null;
  settings: TranslationSettings;
}

export const DEFAULT_SETTINGS: TranslationSettings = {
  sourceLanguage: AUTO_LANGUAGE,
  targetLanguage: "zh-Hans",
  autoDetect: true,
  fallbackSourceLanguage: "en-US",
  detectStrategy: "hybrid",
  detectConfidenceThreshold: 0.6,
  skipSameLanguage: true,
  tone: "neutral",
  glossary: [],
  preserveFormatting: true,
  temperature: 0.2,
  chunkSize: 4000,
  batchMode: "segment",
  cache: { enabled: true, maxEntries: 500 },
  requestTimeoutMs: 60_000,
};

export function defaultProviderConfig(presetId = "mock", id = presetId): ProviderConfig {
  return {
    id,
    kind: "mock",
    model: "mock-1",
    presetId,
    label: "离线演示（无需 Key）",
    enabled: true,
  };
}

export function defaultConfig(): AppConfig {
  return {
    version: CONFIG_VERSION,
    providers: [defaultProviderConfig()],
    activeProviderId: "mock",
    settings: structuredClone(DEFAULT_SETTINGS),
  };
}

export interface ValidationResult {
  ok: boolean;
  errors: string[];
  warnings: string[];
  config: AppConfig;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isLanguageTag(value: unknown): value is LanguageTag {
  return typeof value === "string" && resolveLanguage(value) !== undefined;
}

function numberInRange(value: unknown, min: number, max: number): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= min && value <= max;
}

function validateProvider(input: unknown, index: number, errors: string[]): ProviderConfig | undefined {
  if (!isPlainObject(input)) {
    errors.push(`providers[${index}] must be an object`);
    return undefined;
  }
  const id = typeof input.id === "string" && input.id.trim() ? input.id.trim() : undefined;
  if (!id) {
    errors.push(`providers[${index}].id is required`);
    return undefined;
  }
  const kind = input.kind;
  if (typeof kind !== "string" || !PROVIDER_KINDS.includes(kind as ProviderKind)) {
    errors.push(`providers[${index}].kind must be one of ${PROVIDER_KINDS.join(", ")}`);
    return undefined;
  }
  const model = typeof input.model === "string" ? input.model.trim() : "";
  if (!model && kind !== "mock") {
    errors.push(`providers[${index}].model is required`);
    return undefined;
  }
  const config: ProviderConfig = {
    id,
    kind: kind as ProviderKind,
    model: model || "mock-1",
  };
  const optionalStrings: (keyof ProviderConfig)[] = [
    "presetId",
    "label",
    "baseUrl",
    "apiKey",
    "path",
    "modelsPath",
    "apiKeyHeader",
    "apiKeyPrefix",
  ];
  for (const key of optionalStrings) {
    const value = input[key];
    if (typeof value === "string" && value.length > 0) {
      (config as unknown as Record<string, unknown>)[key] = value;
    }
  }
  if (isPlainObject(input.headers)) {
    config.headers = Object.fromEntries(
      Object.entries(input.headers).filter(([, value]) => typeof value === "string"),
    ) as Record<string, string>;
  }
  if (isPlainObject(input.body)) config.body = input.body;
  if (numberInRange(input.timeoutMs, 1_000, 600_000)) config.timeoutMs = input.timeoutMs;
  if (typeof input.streamUsage === "boolean") config.streamUsage = input.streamUsage;
  if (typeof input.enabled === "boolean") config.enabled = input.enabled;
  else config.enabled = true;
  if (config.kind !== "mock" && !config.model) {
    errors.push(`providers[${index}].model is required for kind "${config.kind}"`);
    return undefined;
  }
  return config;
}

function validateSettings(input: unknown, errors: string[], warnings: string[]): TranslationSettings {
  const settings: TranslationSettings = {
    ...structuredClone(DEFAULT_SETTINGS),
    glossary: [],
    cache: { ...DEFAULT_SETTINGS.cache },
  };
  if (!isPlainObject(input)) {
    warnings.push("settings was missing or invalid; defaults were applied");
    return settings;
  }
  if (input.sourceLanguage === AUTO_LANGUAGE) settings.sourceLanguage = AUTO_LANGUAGE;
  else if (typeof input.sourceLanguage === "string") {
    if (isLanguageTag(input.sourceLanguage)) settings.sourceLanguage = resolveLanguage(input.sourceLanguage)!.tag;
    else errors.push(`settings.sourceLanguage "${input.sourceLanguage}" is not a supported language`);
  }
  if (typeof input.targetLanguage === "string") {
    if (isLanguageTag(input.targetLanguage)) settings.targetLanguage = resolveLanguage(input.targetLanguage)!.tag;
    else errors.push(`settings.targetLanguage "${input.targetLanguage}" is not a supported language`);
  }
  if (typeof input.fallbackSourceLanguage === "string") {
    if (isLanguageTag(input.fallbackSourceLanguage)) {
      settings.fallbackSourceLanguage = resolveLanguage(input.fallbackSourceLanguage)!.tag;
    } else {
      errors.push(
        `settings.fallbackSourceLanguage "${input.fallbackSourceLanguage}" is not a supported language`,
      );
    }
  }
  if (typeof input.autoDetect === "boolean") settings.autoDetect = input.autoDetect;
  if (input.detectStrategy === "heuristic" || input.detectStrategy === "llm" || input.detectStrategy === "hybrid") {
    settings.detectStrategy = input.detectStrategy;
  }
  if (numberInRange(input.detectConfidenceThreshold, 0, 1)) {
    settings.detectConfidenceThreshold = input.detectConfidenceThreshold;
  }
  if (typeof input.skipSameLanguage === "boolean") settings.skipSameLanguage = input.skipSameLanguage;
  if (typeof input.tone === "string" && TONES.includes(input.tone as Tone)) settings.tone = input.tone as Tone;
  if (typeof input.domain === "string" && input.domain.trim()) settings.domain = input.domain.trim();
  if (typeof input.audience === "string" && input.audience.trim()) settings.audience = input.audience.trim();
  if (typeof input.preserveFormatting === "boolean") settings.preserveFormatting = input.preserveFormatting;
  if (numberInRange(input.temperature, 0, 2)) settings.temperature = input.temperature;
  if (numberInRange(input.maxTokens, 16, 200_000)) settings.maxTokens = input.maxTokens;
  if (numberInRange(input.chunkSize, 200, 200_000)) settings.chunkSize = input.chunkSize;
  if (input.batchMode === "segment" || input.batchMode === "json") settings.batchMode = input.batchMode;
  if (numberInRange(input.requestTimeoutMs, 1_000, 600_000)) {
    settings.requestTimeoutMs = input.requestTimeoutMs;
  }
  if (typeof input.systemPromptOverride === "string" && input.systemPromptOverride.trim()) {
    settings.systemPromptOverride = input.systemPromptOverride;
  }
  if (Array.isArray(input.glossary)) {
    const glossary: GlossaryEntry[] = [];
    input.glossary.forEach((entry, index) => {
      if (!isPlainObject(entry)) {
        errors.push(`settings.glossary[${index}] must be an object`);
        return;
      }
      const source = typeof entry.source === "string" ? entry.source.trim() : "";
      const target = typeof entry.target === "string" ? entry.target.trim() : "";
      if (!source || !target) {
        errors.push(`settings.glossary[${index}] needs both source and target`);
        return;
      }
      glossary.push({
        source,
        target,
        ...(entry.caseSensitive === true ? { caseSensitive: true } : {}),
        ...(typeof entry.note === "string" && entry.note.trim() ? { note: entry.note.trim() } : {}),
      });
    });
    settings.glossary = glossary;
  }
  if (isPlainObject(input.cache)) {
    settings.cache = {
      enabled: typeof input.cache.enabled === "boolean" ? input.cache.enabled : settings.cache.enabled,
      maxEntries: numberInRange(input.cache.maxEntries, 0, 100_000)
        ? input.cache.maxEntries
        : settings.cache.maxEntries,
      ...(numberInRange(input.cache.ttlMs, 1_000, 30 * 24 * 60 * 60 * 1000)
        ? { ttlMs: input.cache.ttlMs }
        : {}),
    };
  }
  if (settings.autoDetect && settings.sourceLanguage !== AUTO_LANGUAGE) {
    warnings.push("autoDetect is on; sourceLanguage will be treated as a hint");
  }
  if (settings.chunkSize < 200) warnings.push("chunkSize is very small and may split sentences awkwardly");
  return settings;
}

export function validateConfig(input: unknown): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  if (!isPlainObject(input)) {
    return { ok: false, errors: ["config must be an object"], warnings, config: defaultConfig() };
  }
  const providersInput = Array.isArray(input.providers) ? input.providers : [];
  if (providersInput.length === 0) warnings.push("no providers configured; add one to translate");
  const providers: ProviderConfig[] = [];
  const seen = new Set<string>();
  providersInput.forEach((entry, index) => {
    const provider = validateProvider(entry, index, errors);
    if (!provider) return;
    if (seen.has(provider.id)) {
      errors.push(`providers[${index}].id "${provider.id}" is duplicated`);
      return;
    }
    seen.add(provider.id);
    providers.push(provider);
  });
  const settings = validateSettings(input.settings, errors, warnings);
  let activeProviderId: string | null =
    typeof input.activeProviderId === "string" && input.activeProviderId.trim()
      ? input.activeProviderId.trim()
      : null;
  if (activeProviderId && !providers.some((provider) => provider.id === activeProviderId)) {
    warnings.push(`activeProviderId "${activeProviderId}" does not exist; falling back`);
    activeProviderId = null;
  }
  if (!activeProviderId) {
    activeProviderId = providers.find((provider) => provider.enabled !== false)?.id ?? providers[0]?.id ?? null;
  }
  const version = input.version === CONFIG_VERSION ? CONFIG_VERSION : CONFIG_VERSION;
  if (input.version !== CONFIG_VERSION) {
    warnings.push(`config version was ${String(input.version)}; migrated to ${CONFIG_VERSION}`);
  }
  return {
    ok: errors.length === 0,
    errors,
    warnings,
    config: { version, providers, activeProviderId, settings },
  };
}

export function parseConfig(json: string | unknown): ValidationResult {
  if (typeof json === "string") {
    try {
      return validateConfig(JSON.parse(json));
    } catch (error) {
      return {
        ok: false,
        errors: [`config is not valid JSON: ${(error as Error).message}`],
        warnings: [],
        config: defaultConfig(),
      };
    }
  }
  return validateConfig(json);
}

export function mergeConfig(base: AppConfig, patch: Partial<AppConfig>): ValidationResult {
  const merged: AppConfig = {
    version: CONFIG_VERSION,
    providers: patch.providers ?? base.providers,
    activeProviderId: patch.activeProviderId ?? base.activeProviderId,
    settings: { ...base.settings, ...(patch.settings ?? {}) },
  };
  return validateConfig(merged);
}

export function mergeSettings(
  base: TranslationSettings,
  patch: Partial<TranslationSettings>,
): TranslationSettings {
  return validateConfig({
    version: CONFIG_VERSION,
    providers: [],
    activeProviderId: null,
    settings: { ...base, ...patch },
  }).config.settings;
}

export function redactConfig(config: AppConfig): AppConfig {
  return {
    ...config,
    providers: config.providers.map((provider) =>
      provider.apiKey ? { ...provider, apiKey: provider.apiKey ? "***" : undefined } : { ...provider },
    ),
  };
}

export function exportConfigJson(config: AppConfig, options: { includeSecrets?: boolean } = {}): string {
  return JSON.stringify(options.includeSecrets === false ? redactConfig(config) : config, null, 2);
}

export function resolveActiveProvider(config: AppConfig, providerId?: string): ProviderConfig | undefined {
  const target = providerId ?? config.activeProviderId;
  if (target) {
    const found = config.providers.find((provider) => provider.id === target);
    if (found) return found;
  }
  return config.providers.find((provider) => provider.enabled !== false) ?? config.providers[0];
}
