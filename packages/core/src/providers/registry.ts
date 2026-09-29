import type { ProviderConfig } from "../config.ts";
import { TranslatorError } from "../errors.ts";
import { AnthropicProvider } from "./anthropic.ts";
import { GoogleProvider } from "./google.ts";
import { MockProvider } from "./mock.ts";
import { OpenAiCompatibleProvider } from "./openai-compatible.ts";
import { getPreset } from "./presets.ts";
import type { FetchLike, Provider } from "./types.ts";

export interface ProviderDeps {
  fetchImpl?: FetchLike;
}

export function createProvider(config: ProviderConfig, deps: ProviderDeps = {}): Provider {
  const preset = getPreset(config.presetId);
  const label = config.label ?? preset?.label ?? config.id;
  const baseUrl = config.baseUrl ?? preset?.baseUrl;
  const common = {
    id: config.id,
    label,
    model: config.model,
    ...(baseUrl ? { baseUrl } : {}),
    ...(config.apiKey ? { apiKey: config.apiKey } : {}),
    ...(config.headers ? { headers: config.headers } : {}),
    ...(config.timeoutMs ? { timeoutMs: config.timeoutMs } : {}),
    ...(deps.fetchImpl ? { fetchImpl: deps.fetchImpl } : {}),
  };
  switch (config.kind) {
    case "openai-compatible":
      return new OpenAiCompatibleProvider({
        ...common,
        ...(config.path ? { path: config.path } : {}),
        ...(config.modelsPath ? { modelsPath: config.modelsPath } : {}),
        ...(config.apiKeyHeader ? { apiKeyHeader: config.apiKeyHeader } : {}),
        ...(config.apiKeyPrefix ? { apiKeyPrefix: config.apiKeyPrefix } : {}),
        ...(config.streamUsage === undefined ? {} : { streamUsage: config.streamUsage }),
        ...(config.body ? { extraBody: config.body } : {}),
      });
    case "anthropic":
      return new AnthropicProvider({ ...common, ...(config.body ? { extraBody: config.body } : {}) });
    case "google":
      return new GoogleProvider({ ...common, ...(config.body ? { extraBody: config.body } : {}) });
    case "mock":
      return new MockProvider({ id: config.id, label, model: config.model || "mock-1" });
    default: {
      const unknownKind: never = config.kind;
      throw new TranslatorError("config_invalid", `Unknown provider kind: ${String(unknownKind)}`, {
        providerId: config.id,
      });
    }
  }
}

export function uniqueProviderId(existing: readonly ProviderConfig[], base: string): string {
  const taken = new Set(existing.map((provider) => provider.id));
  if (!taken.has(base)) return base;
  let index = 2;
  while (taken.has(`${base}-${index}`)) index += 1;
  return `${base}-${index}`;
}

export function providerConfigFromPreset(
  presetId: string,
  existing: readonly ProviderConfig[] = [],
  overrides: Partial<ProviderConfig> = {},
): ProviderConfig {
  const preset = getPreset(presetId);
  if (!preset) {
    throw new TranslatorError("config_invalid", `Unknown provider preset: ${presetId}`);
  }
  return {
    id: uniqueProviderId(existing, overrides.id ?? preset.id),
    kind: preset.kind,
    model: preset.defaultModel,
    presetId: preset.id,
    label: preset.label,
    ...(preset.baseUrl ? { baseUrl: preset.baseUrl } : {}),
    enabled: true,
    ...overrides,
  };
}

export interface ProviderHealth {
  ok: boolean;
  latencyMs: number;
  models?: string[];
  error?: string;
  code?: string;
}

export async function testProvider(
  config: ProviderConfig,
  deps: ProviderDeps = {},
): Promise<ProviderHealth> {
  const started = Date.now();
  try {
    const provider = createProvider(config, deps);
    const models = await provider.listModels();
    return { ok: true, latencyMs: Date.now() - started, models: models.slice(0, 50) };
  } catch (error) {
    const latencyMs = Date.now() - started;
    if (error instanceof TranslatorError) {
      return { ok: false, latencyMs, error: error.message, code: error.code };
    }
    return { ok: false, latencyMs, error: (error as Error).message ?? String(error) };
  }
}

export { getPreset, PROVIDER_PRESETS, presetsByKind } from "./presets.ts";
export type { Provider, ChatMessage, ChatOptions, ChatResult, ChatChunk, TokenUsage, ProviderKind } from "./types.ts";

