export {
  AUTO_LANGUAGE,
  LANGUAGES,
  baseLanguage,
  getLanguage,
  isAutoLanguage,
  isRightToLeft,
  languageLabel,
  languagesForScript,
  normalizeLanguageId,
  normalizeLanguageTag,
  requireLanguage,
  resolveLanguage,
  sameBaseLanguage,
} from "./language.ts";
export type { AutoLanguage, LanguageDef, LanguageTag, ScriptName } from "./language.ts";

export {
  DEFAULT_FALLBACK_LANGUAGE,
  DEFAULT_MIN_CONFIDENCE,
  analyzeScripts,
  describeDetection,
  detectLanguage,
} from "./detect.ts";
export type {
  DetectOptions,
  DetectionCandidate,
  DetectionMethod,
  DetectionResult,
  ScriptAnalysis,
} from "./detect.ts";

export {
  chunkText,
  cleanModelOutput,
  countPlaceholders,
  protectText,
  splitSentences,
  textStats,
  truncate,
} from "./text.ts";
export type { PlaceholderToken, ProtectOptions, ProtectedText, SentenceUnit, TextStats } from "./text.ts";

export {
  TONES,
  TONE_INSTRUCTIONS,
  buildBatchPrompt,
  buildDetectionPrompt,
  buildSystemPrompt,
  buildTranslationPrompt,
  parseBatchResponse,
} from "./prompt.ts";
export type { BatchPromptResult, BuiltPrompt, GlossaryEntry, PromptOptions, Tone } from "./prompt.ts";

export {
  CONFIG_VERSION,
  DEFAULT_SETTINGS,
  PROVIDER_KINDS,
  defaultConfig,
  defaultProviderConfig,
  exportConfigJson,
  mergeConfig,
  mergeSettings,
  parseConfig,
  redactConfig,
  resolveActiveProvider,
  validateConfig,
} from "./config.ts";
export type {
  AppConfig,
  BatchMode,
  CacheSettings,
  DetectStrategy,
  ProviderConfig,
  TranslationSettings,
  ValidationResult,
} from "./config.ts";

export { LruCache, TranslationCache, translationCacheKey } from "./cache.ts";
export type { CacheOptions, CacheStats, TranslationCacheKeyInput } from "./cache.ts";

export { TranslatorError, isTranslatorError, toTranslatorError } from "./errors.ts";
export type { TranslatorErrorCode } from "./errors.ts";

export { fnv1a, hashKey, stableStringify } from "./hash.ts";

export {
  CONFIG_STORAGE_KEY,
  LocalStorageConfigStore,
  MemoryConfigStore,
  createLocalConfigStore,
} from "./storage.ts";
export type { ConfigStore, StorageLike } from "./storage.ts";

export { Translator } from "./engine.ts";
export type { TranslatorOptions } from "./engine.ts";
export type {
  StreamEvent,
  TranslateOptions,
  TranslationResult,
  TranslationSource,
  TranslatorEvent,
} from "./engine-types.ts";

export { PROVIDER_PRESETS, getPreset, presetsByKind } from "./providers/presets.ts";
export type { ProviderPreset } from "./providers/presets.ts";
export {
  createProvider,
  providerConfigFromPreset,
  testProvider,
  uniqueProviderId,
} from "./providers/registry.ts";
export type { ProviderDeps, ProviderHealth } from "./providers/registry.ts";
export { OpenAiCompatibleProvider, extractOpenAiText } from "./providers/openai-compatible.ts";
export type { OpenAiCompatibleConfig } from "./providers/openai-compatible.ts";
export { AnthropicProvider } from "./providers/anthropic.ts";
export type { AnthropicConfig } from "./providers/anthropic.ts";
export { GoogleProvider } from "./providers/google.ts";
export type { GoogleConfig } from "./providers/google.ts";
export { DEFAULT_MOCK_DICTIONARY, MockProvider } from "./providers/mock.ts";
export type { MockConfig } from "./providers/mock.ts";
export { combineSignals, joinUrl, normalizeUsage, requestJson, requestSse } from "./providers/http.ts";
export type { JsonRequestOptions, SseEvent } from "./providers/http.ts";
export type {
  ChatChunk,
  ChatMessage,
  ChatOptions,
  ChatResult,
  FetchLike,
  Provider,
  ProviderCapabilities,
  ProviderFactoryConfig,
  ProviderKind,
  TokenUsage,
} from "./providers/types.ts";
