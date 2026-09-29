export {
  DEFAULT_SETTINGS,
  PROVIDER_PRESETS,
  TONES,
  TONE_INSTRUCTIONS,
  createProvider,
  defaultConfig,
  describeDetection,
  exportConfigJson,
  getPreset,
  mergeSettings,
  parseConfig,
  providerConfigFromPreset,
  testProvider,
  validateConfig,
} from "../../core/src/index.ts";
export type {
  AppConfig,
  ConfigStore,
  DetectionResult,
  LanguageDef,
  ProviderConfig,
  ProviderHealth,
  ProviderPreset,
  TranslateOptions,
  TranslationResult,
  TranslationSettings,
  Tone,
  Translator,
  TranslatorOptions,
} from "../../core/src/index.ts";
export { Translator as TranslatorClass } from "../../core/src/index.ts";

