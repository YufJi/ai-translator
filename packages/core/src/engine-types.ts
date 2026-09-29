import type { BatchMode } from "./config.ts";
import type { DetectionMethod, DetectionResult } from "./detect.ts";
import type { GlossaryEntry, Tone } from "./prompt.ts";
import type { LanguageTag } from "./language.ts";
import type { TranslatorError } from "./errors.ts";
import type { TokenUsage } from "./providers/types.ts";

export interface TranslateOptions {
  from?: LanguageTag | "auto";
  to?: LanguageTag;
  providerId?: string;
  tone?: Tone;
  domain?: string;
  audience?: string;
  glossary?: readonly GlossaryEntry[];
  context?: string;
  temperature?: number;
  signal?: AbortSignal;
  useCache?: boolean;
  autoDetect?: boolean;
  skipSameLanguage?: boolean;
  systemPromptOverride?: string;
  concurrency?: number;
  batchMode?: BatchMode;
}

export interface TranslationSource {
  language: LanguageTag;
  detected: boolean;
  confidence: number;
  method: DetectionMethod;
  alternatives: LanguageTag[];
}

export interface TranslationResult {
  text: string;
  source: TranslationSource;
  target: LanguageTag;
  providerId: string;
  providerLabel: string;
  model: string;
  cacheHit: boolean;
  skipped: boolean;
  chunkCount: number;
  latencyMs: number;
  usage?: TokenUsage;
  warnings: string[];
}

export type TranslatorEvent =
  | { type: "detected"; result: DetectionResult }
  | { type: "cache-hit"; chunks: number; total: number }
  | { type: "chunk-start"; index: number; total: number }
  | { type: "chunk-done"; index: number; total: number }
  | { type: "retry"; reason: string; index: number }
  | { type: "provider-error"; error: TranslatorError };

export type StreamEvent =
  | { type: "detected"; result: DetectionResult }
  | { type: "delta"; text: string }
  | { type: "done"; result: TranslationResult };

