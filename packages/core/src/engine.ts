import { TranslationCache, translationCacheKey } from "./cache.ts";
import {
  resolveActiveProvider,
  type AppConfig,
  type BatchMode,
  type ProviderConfig,
  type TranslationSettings,
} from "./config.ts";
import { detectLanguage, type DetectionResult } from "./detect.ts";
import { TranslatorError, toTranslatorError } from "./errors.ts";
import {
  AUTO_LANGUAGE,
  isAutoLanguage,
  resolveLanguage,
  sameBaseLanguage,
  type LanguageTag,
} from "./language.ts";
import {
  buildBatchPrompt,
  buildDetectionPrompt,
  buildSystemPrompt,
  parseBatchResponse,
  type PromptOptions,
} from "./prompt.ts";
import { createProvider, testProvider, type ProviderDeps, type ProviderHealth } from "./providers/registry.ts";
import type { ChatMessage, Provider, TokenUsage } from "./providers/types.ts";
import { chunkText, cleanModelOutput, protectText, type ProtectedText } from "./text.ts";
import {
  DEFAULT_CONCURRENCY,
  JSON_BATCH_LIMIT,
  LLM_DETECT_SAMPLE,
  hasTranslatableContent,
  mapLimit,
  mergeUsage,
  providerIdentity,
  restoreWithGuard,
  runSegment,
} from "./engine-utils.ts";
import type {
  StreamEvent,
  TranslateOptions,
  TranslationResult,
  TranslatorEvent,
} from "./engine-types.ts";

export interface TranslatorOptions extends ProviderDeps {
  config: AppConfig;
  cache?: TranslationCache;
  onEvent?: (event: TranslatorEvent) => void;
}

interface ChunkTask {
  index: number;
  chunk: string;
  guard: ProtectedText;
}

export class Translator {
  private config: AppConfig;
  private readonly deps: ProviderDeps;
  private readonly cache: TranslationCache;
  private readonly onEvent?: (event: TranslatorEvent) => void;
  private readonly providers = new Map<string, { key: string; provider: Provider }>();

  constructor(options: TranslatorOptions) {
    this.config = options.config;
    this.deps = options.fetchImpl ? { fetchImpl: options.fetchImpl } : {};
    this.cache = options.cache ?? new TranslationCache({ maxEntries: options.config.settings.cache.maxEntries });
    this.onEvent = options.onEvent;
  }

  getConfig(): AppConfig {
    return this.config;
  }

  setConfig(config: AppConfig): void {
    this.config = config;
  }

  get settings(): TranslationSettings {
    return this.config.settings;
  }

  clearCache(): void {
    this.cache.clear();
  }

  cacheStats(): ReturnType<TranslationCache["stats"]> {
    return this.cache.stats();
  }

  getProvider(providerId?: string): Provider {
    return this.#memoizedProvider(this.#requireProviderConfig(providerId));
  }

  async listModels(providerId?: string): Promise<string[]> {
    return this.getProvider(providerId).listModels();
  }

  async checkProvider(providerId?: string): Promise<ProviderHealth> {
    return testProvider(this.#requireProviderConfig(providerId), this.deps);
  }

  async detect(text: string, options: TranslateOptions = {}): Promise<DetectionResult> {
    return this.#resolveSource(text, options, this.settings);
  }

  async translate(text: string, options?: TranslateOptions): Promise<TranslationResult>;
  async translate(text: readonly string[], options?: TranslateOptions): Promise<TranslationResult[]>;
  async translate(
    text: string | readonly string[],
    options: TranslateOptions = {},
  ): Promise<TranslationResult | TranslationResult[]> {
    if (typeof text === "string") return this.#translateOne(text, options);
    return mapLimit(text, Math.max(1, options.concurrency ?? DEFAULT_CONCURRENCY), (item) =>
      this.#translateOne(item, options),
    );
  }

  async *streamTranslate(text: string, options: TranslateOptions = {}): AsyncGenerator<StreamEvent, void, void> {
    const settings = this.settings;
    const providerConfig = this.#requireProviderConfig(options.providerId);
    const provider = this.#memoizedProvider(providerConfig);
    const target = this.#targetLanguage(options, settings);
    const started = Date.now();
    const warnings: string[] = [];
    const source = await this.#resolveSource(text, options, settings);
    yield { type: "detected", result: source };

    if (this.#shouldSkip(source, target, options, settings)) {
      yield { type: "delta", text };
      yield {
        type: "done",
        result: this.#buildResult({
          text,
          source,
          target,
          providerConfig,
          model: provider.model,
          skipped: true,
          cacheHit: false,
          chunkCount: 1,
          started,
          warnings,
        }),
      };
      return;
    }

    const chunks = this.#chunksFor(text, settings);
    const promptOptions = this.#promptOptions(options, settings, source, target);
    const systemPrompt = buildSystemPrompt(promptOptions);
    const temperature = options.temperature ?? settings.temperature;
    const useCache = options.useCache ?? settings.cache.enabled;
    let accumulated = "";
    let usage: TokenUsage | undefined;
    let cacheHits = 0;

    for (let index = 0; index < chunks.length; index += 1) {
      const chunk = chunks[index]!;
      if (!hasTranslatableContent(chunk)) {
        accumulated += chunk;
        yield { type: "delta", text: chunk };
        continue;
      }
      const guard = protectText(chunk);
      const key = this.#cacheKey(guard.text, {
        providerConfig,
        model: provider.model,
        source: source.language,
        target,
        systemPrompt,
        temperature,
        options,
        settings,
        batchMode: "segment",
      });
      const cached = useCache ? this.cache.get(key) : undefined;
      if (cached) {
        cacheHits += 1;
        accumulated += cached.text;
        yield { type: "delta", text: cached.text };
        continue;
      }
      let produced = "";
      let chunkUsage: TokenUsage | undefined;
      for await (const piece of provider.stream(
        [
          { role: "system", content: systemPrompt },
          { role: "user", content: guard.text },
        ],
        {
          temperature,
          ...(settings.maxTokens ? { maxTokens: settings.maxTokens } : {}),
          ...(options.signal ? { signal: options.signal } : {}),
        },
      )) {
        if (piece.delta.length > 0) {
          produced += piece.delta;
          yield { type: "delta", text: piece.delta };
        }
        if (piece.usage) chunkUsage = mergeUsage(chunkUsage, piece.usage);
      }
      usage = mergeUsage(usage, chunkUsage);
      const restored = guard.restore(cleanModelOutput(produced));
      if (useCache) this.cache.set(key, { text: restored });
      accumulated += restored;
    }

    if (cacheHits > 0) this.#emit({ type: "cache-hit", chunks: cacheHits, total: chunks.length });
    yield {
      type: "done",
      result: this.#buildResult({
        text: accumulated,
        source,
        target,
        providerConfig,
        model: provider.model,
        skipped: false,
        cacheHit: cacheHits === chunks.length,
        chunkCount: chunks.length,
        started,
        warnings,
        ...(usage ? { usage } : {}),
      }),
    };
  }

  #emit(event: TranslatorEvent): void {
    this.onEvent?.(event);
  }

  #memoizedProvider(config: ProviderConfig): Provider {
    const key = providerIdentity(config);
    const existing = this.providers.get(config.id);
    if (existing && existing.key === key) return existing.provider;
    const provider = createProvider(config, this.deps);
    this.providers.set(config.id, { key, provider });
    return provider;
  }

  #requireProviderConfig(providerId?: string): ProviderConfig {
    const config = resolveActiveProvider(this.config, providerId);
    if (!config) {
      throw new TranslatorError("provider_not_found", "No model provider is configured yet");
    }
    return config;
  }

  #targetLanguage(options: TranslateOptions, settings: TranslationSettings): LanguageTag {
    const requested = options.to ?? settings.targetLanguage;
    return resolveLanguage(requested)?.tag ?? requested;
  }

  #shouldSkip(
    source: DetectionResult,
    target: LanguageTag,
    options: TranslateOptions,
    settings: TranslationSettings,
  ): boolean {
    const skip = options.skipSameLanguage ?? settings.skipSameLanguage;
    return (
      skip &&
      source.confidence >= settings.detectConfidenceThreshold &&
      sameBaseLanguage(source.language, target)
    );
  }

  #chunksFor(text: string, settings: TranslationSettings): string[] {
    const chunks = chunkText(text, settings.chunkSize);
    return chunks.length > 0 ? chunks : [text];
  }

  #promptOptions(
    options: TranslateOptions,
    settings: TranslationSettings,
    source: DetectionResult | undefined,
    target: LanguageTag,
  ): PromptOptions {
    const domain = options.domain ?? settings.domain;
    const audience = options.audience ?? settings.audience;
    const systemPromptOverride = options.systemPromptOverride ?? settings.systemPromptOverride;
    return {
      source: options.from && !isAutoLanguage(options.from) ? options.from : AUTO_LANGUAGE,
      target,
      ...(source && source.confidence > 0 && source.method !== "declared"
        ? { detectedSource: source.language }
        : {}),
      tone: options.tone ?? settings.tone,
      ...(domain ? { domain } : {}),
      ...(audience ? { audience } : {}),
      glossary: options.glossary ?? settings.glossary,
      ...(options.context ? { context: options.context } : {}),
      preserveFormatting: settings.preserveFormatting,
      ...(systemPromptOverride ? { systemPromptOverride } : {}),
    };
  }

  #cacheKey(
    protectedText: string,
    input: {
      providerConfig: ProviderConfig;
      model: string;
      source: LanguageTag;
      target: LanguageTag;
      systemPrompt: string;
      temperature: number;
      options: TranslateOptions;
      settings: TranslationSettings;
      batchMode: BatchMode;
    },
  ): string {
    const { options, settings } = input;
    return translationCacheKey({
      providerId: input.providerConfig.id,
      model: input.model,
      from: input.source,
      to: input.target,
      text: protectedText,
      tone: options.tone ?? settings.tone,
      ...((options.domain ?? settings.domain) ? { domain: options.domain ?? settings.domain } : {}),
      ...((options.audience ?? settings.audience)
        ? { audience: options.audience ?? settings.audience }
        : {}),
      glossary: options.glossary ?? settings.glossary,
      systemPrompt: input.batchMode === "segment" ? input.systemPrompt : `${input.systemPrompt}\u0000batch`,
      temperature: input.temperature,
    });
  }

  #buildResult(input: {
    text: string;
    source: DetectionResult;
    target: LanguageTag;
    providerConfig: ProviderConfig;
    model: string;
    skipped: boolean;
    cacheHit: boolean;
    chunkCount: number;
    started: number;
    warnings: string[];
    usage?: TokenUsage;
  }): TranslationResult {
    return {
      text: input.text,
      source: {
        language: input.source.language,
        detected: input.source.method === "heuristic" || input.source.method === "llm",
        confidence: input.source.confidence,
        method: input.source.method,
        alternatives: input.source.candidates.slice(1, 4).map((candidate) => candidate.language),
      },
      target: input.target,
      providerId: input.providerConfig.id,
      providerLabel: input.providerConfig.label ?? input.providerConfig.id,
      model: input.model,
      cacheHit: input.cacheHit,
      skipped: input.skipped,
      chunkCount: input.chunkCount,
      latencyMs: Date.now() - input.started,
      warnings: input.warnings,
      ...(input.usage ? { usage: input.usage } : {}),
    };
  }

  async #resolveSource(
    text: string,
    options: TranslateOptions,
    settings: TranslationSettings,
  ): Promise<DetectionResult> {
    const explicit = options.from;
    if (explicit && !isAutoLanguage(explicit)) {
      return declared(resolveLanguage(explicit)?.tag ?? explicit);
    }
    if (!(options.autoDetect ?? settings.autoDetect)) {
      const pinned = resolveLanguage(settings.sourceLanguage)?.tag ?? settings.fallbackSourceLanguage;
      return declared(pinned);
    }
    const heuristic = detectLanguage(text, {
      fallback: settings.fallbackSourceLanguage,
      minConfidence: settings.detectConfidenceThreshold,
    });
    const threshold = settings.detectConfidenceThreshold;
    if (heuristic.confidence >= threshold || settings.detectStrategy === "heuristic") {
      this.#emit({ type: "detected", result: heuristic });
      return heuristic;
    }
    try {
      const llmResult = await this.#detectWithProvider(text, options);
      if (llmResult) {
        this.#emit({ type: "detected", result: llmResult });
        return llmResult;
      }
    } catch (error) {
      if (error instanceof TranslatorError && error.code === "aborted") throw error;
      this.#emit({ type: "provider-error", error: toTranslatorError(error) });
    }
    this.#emit({ type: "detected", result: heuristic });
    return heuristic;
  }

  async #detectWithProvider(
    text: string,
    options: TranslateOptions,
  ): Promise<DetectionResult | undefined> {
    const providerConfig = resolveActiveProvider(this.config, options.providerId);
    if (!providerConfig || providerConfig.kind === "mock") return undefined;
    const provider = this.#memoizedProvider(providerConfig);
    const prompt = buildDetectionPrompt({ text: text.slice(0, LLM_DETECT_SAMPLE) });
    const response = await provider.chat(
      [
        { role: "system", content: prompt.system },
        { role: "user", content: prompt.user },
      ],
      {
        temperature: 0,
        maxTokens: 24,
        ...(options.signal ? { signal: options.signal } : {}),
      },
    );
    const tag = response.text.trim().replace(/[.,;:"'`]/g, "").split(/\s+/)[0] ?? "";
    const resolved = resolveLanguage(tag);
    if (!resolved) return undefined;
    return {
      language: resolved.tag,
      confidence: 0.92,
      candidates: [{ language: resolved.tag, score: 0.92 }],
      method: "llm",
      scriptShares: {},
    };
  }

  async #translateOne(text: string, options: TranslateOptions): Promise<TranslationResult> {
    const settings = this.settings;
    const providerConfig = this.#requireProviderConfig(options.providerId);
    const provider = this.#memoizedProvider(providerConfig);
    const target = this.#targetLanguage(options, settings);
    const started = Date.now();
    const warnings: string[] = [];
    const source = await this.#resolveSource(text, options, settings);

    if (this.#shouldSkip(source, target, options, settings)) {
      return this.#buildResult({
        text,
        source,
        target,
        providerConfig,
        model: provider.model,
        skipped: true,
        cacheHit: false,
        chunkCount: 1,
        started,
        warnings,
      });
    }

    const chunks = this.#chunksFor(text, settings);
    const promptOptions = this.#promptOptions(options, settings, source, target);
    const systemPrompt = buildSystemPrompt(promptOptions);
    const temperature = options.temperature ?? settings.temperature;
    const useCache = options.useCache ?? settings.cache.enabled;
    const batchMode = options.batchMode ?? settings.batchMode;
    const concurrency = Math.max(1, options.concurrency ?? DEFAULT_CONCURRENCY);

    const passthrough = new Map<number, string>();
    const cachedText = new Map<number, string>();
    const keys = new Map<number, string>();
    const tasks: ChunkTask[] = [];
    let cacheHits = 0;

    chunks.forEach((chunk, index) => {
      if (!hasTranslatableContent(chunk)) {
        passthrough.set(index, chunk);
        return;
      }
      const guard = protectText(chunk);
      const key = this.#cacheKey(guard.text, {
        providerConfig,
        model: provider.model,
        source: source.language,
        target,
        systemPrompt,
        temperature,
        options,
        settings,
        batchMode,
      });
      keys.set(index, key);
      const cached = useCache ? this.cache.get(key) : undefined;
      if (cached) {
        cacheHits += 1;
        cachedText.set(index, cached.text);
        return;
      }
      tasks.push({ index, chunk, guard });
    });

    const produced = new Map<number, string>();
    let usage: TokenUsage | undefined;
    const runOne = async (task: ChunkTask): Promise<void> => {
      this.#emit({ type: "chunk-start", index: task.index, total: chunks.length });
      const response = await runSegment({
        provider,
        systemPrompt,
        guard: task.guard,
        temperature,
        ...(settings.maxTokens ? { maxTokens: settings.maxTokens } : {}),
        ...(options.signal ? { signal: options.signal } : {}),
        index: task.index,
        warnings,
        onRetry: (reason, index) => this.#emit({ type: "retry", reason, index }),
      });
      produced.set(task.index, response.text);
      usage = mergeUsage(usage, response.usage);
      const key = keys.get(task.index);
      if (key && useCache) this.cache.set(key, { text: response.text });
      this.#emit({ type: "chunk-done", index: task.index, total: chunks.length });
    };

    if (batchMode === "json" && tasks.length > 1) {
      await mapLimit(groupTasks(tasks, JSON_BATCH_LIMIT), concurrency, async (group) => {
        try {
          const batch = buildBatchPrompt({ ...promptOptions, segments: group.map((task) => task.guard.text) });
          const response = await provider.chat(
            [
              { role: "system", content: batch.system },
              { role: "user", content: batch.user },
            ],
            {
              temperature,
              jsonMode: true,
              ...(settings.maxTokens ? { maxTokens: settings.maxTokens } : {}),
              ...(options.signal ? { signal: options.signal } : {}),
            },
          );
          const texts = parseBatchResponse(response.text, group.length);
          usage = mergeUsage(usage, response.usage);
          group.forEach((task, position) => {
            const restored = restoreWithGuard(texts[position] ?? "", task.guard, task.index, warnings);
            produced.set(task.index, restored.text);
            const key = keys.get(task.index);
            if (key && useCache) this.cache.set(key, { text: restored.text });
          });
        } catch (error) {
          warnings.push(`json batch fell back to per-segment requests: ${(error as Error).message}`);
          for (const task of group) await runOne(task);
        }
      });
    } else {
      await mapLimit(tasks, concurrency, runOne);
    }

    if (cacheHits > 0) this.#emit({ type: "cache-hit", chunks: cacheHits, total: chunks.length });

    const merged = chunks.map((chunk, index) => {
      const value = passthrough.get(index) ?? cachedText.get(index) ?? produced.get(index);
      return value === undefined ? chunk : value;
    });
    return this.#buildResult({
      text: merged.join(""),
      source,
      target,
      providerConfig,
      model: provider.model,
      skipped: false,
      cacheHit: cacheHits > 0 && cacheHits === chunks.length,
      chunkCount: chunks.length,
      started,
      warnings,
      ...(usage ? { usage } : {}),
    });
  }
}

function declared(language: LanguageTag): DetectionResult {
  return {
    language,
    confidence: 1,
    candidates: [{ language, score: 1 }],
    method: "declared",
    scriptShares: {},
  };
}

function groupTasks(tasks: readonly ChunkTask[], size: number): ChunkTask[][] {
  const groups: ChunkTask[][] = [];
  for (let index = 0; index < tasks.length; index += size) {
    groups.push(tasks.slice(index, index + size));
  }
  return groups;
}

export type { StreamEvent, TranslateOptions, TranslationResult, TranslatorEvent } from "./engine-types.ts";
