import { TranslatorError } from "../errors.ts";
import { DEFAULT_TIMEOUT_MS, joinUrl, requestJson, requestSse } from "./http.ts";
import type {
  ChatChunk,
  ChatMessage,
  ChatOptions,
  ChatResult,
  FetchLike,
  Provider,
  ProviderCapabilities,
  ProviderFactoryConfig,
  TokenUsage,
} from "./types.ts";

export interface GoogleConfig extends ProviderFactoryConfig {
  apiVersion?: string;
  extraBody?: Record<string, unknown>;
}

interface GeminiResponse {
  candidates?: {
    content?: { parts?: { text?: string }[] };
    finishReason?: string;
  }[];
  usageMetadata?: {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
    totalTokenCount?: number;
  };
}

export class GoogleProvider implements Provider {
  readonly kind = "google" as const;
  readonly capabilities: ProviderCapabilities = {
    streaming: true,
    jsonMode: true,
    listModels: true,
  };
  readonly id: string;
  readonly label: string;
  readonly model: string;

  private readonly baseUrl: string;
  private readonly apiVersion: string;
  private readonly extraBody: Record<string, unknown>;
  private readonly timeoutMs: number;
  private readonly fetchImpl: FetchLike;
  private readonly headers: Record<string, string>;

  constructor(config: GoogleConfig = { model: "" } as GoogleConfig) {
    this.id = config.id;
    this.model = config.model;
    this.label = config.label ?? config.id;
    this.baseUrl = (config.baseUrl ?? "https://generativelanguage.googleapis.com").replace(/\/+$/, "");
    this.apiVersion = config.apiVersion ?? "v1beta";
    this.extraBody = config.extraBody ?? {};
    this.timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.fetchImpl = config.fetchImpl ?? fetch;
    this.headers = {
      ...(config.apiKey ? { "x-goog-api-key": config.apiKey } : {}),
      ...(config.headers ?? {}),
    };
  }

  private buildBody(messages: readonly ChatMessage[], options: ChatOptions) {
    const system = messages
      .filter((message) => message.role === "system")
      .map((message) => message.content)
      .join("\n\n");
    const contents = messages
      .filter((message) => message.role !== "system")
      .map((message) => ({
        role: message.role === "assistant" ? "model" : "user",
        parts: [{ text: message.content }],
      }));
    return {
      ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}),
      contents: contents.length > 0 ? contents : [{ role: "user", parts: [{ text: "" }] }],
      generationConfig: {
        ...(options.temperature === undefined ? {} : { temperature: options.temperature }),
        ...(options.maxTokens === undefined ? {} : { maxOutputTokens: options.maxTokens }),
        ...(options.jsonMode ? { responseMimeType: "application/json" } : {}),
      },
      ...this.extraBody,
      ...(options.extraBody ?? {}),
    };
  }

  private url(method: string, options: ChatOptions, stream: boolean): string {
    const model = options.model ?? this.model;
    if (!model) {
      throw new TranslatorError("config_invalid", `Provider "${this.id}" has no model configured`, {
        providerId: this.id,
      });
    }
    const suffix = stream ? "?alt=sse" : "";
    return `${joinUrl(this.baseUrl, `/${this.apiVersion}/models/${encodeURIComponent(model)}:${method}`)}${suffix}`;
  }

  private extract(data: GeminiResponse): string {
    return (data.candidates?.[0]?.content?.parts ?? []).map((part) => part.text ?? "").join("");
  }

  async chat(messages: readonly ChatMessage[], options: ChatOptions = {}): Promise<ChatResult> {
    const { data } = await requestJson<GeminiResponse>({
      url: this.url("generateContent", options, false),
      headers: this.headers,
      body: this.buildBody(messages, options),
      timeoutMs: this.timeoutMs,
      signal: options.signal,
      fetchImpl: this.fetchImpl,
      providerId: this.id,
    });
    const text = this.extract(data);
    if (!text.trim()) {
      throw new TranslatorError("empty_response", `Provider "${this.id}" returned an empty translation`, {
        providerId: this.id,
      });
    }
    return {
      text,
      model: options.model ?? this.model,
      finishReason: data.candidates?.[0]?.finishReason,
      usage: googleUsage(data.usageMetadata),
      raw: data,
    };
  }

  async *stream(
    messages: readonly ChatMessage[],
    options: ChatOptions = {},
  ): AsyncGenerator<ChatChunk, void, void> {
    let usage: TokenUsage | undefined;
    let received = false;
    for await (const event of requestSse({
      url: this.url("streamGenerateContent", options, true),
      headers: this.headers,
      body: this.buildBody(messages, options),
      timeoutMs: this.timeoutMs * 4,
      signal: options.signal,
      fetchImpl: this.fetchImpl,
      providerId: this.id,
    })) {
      if (event.data.trim().length === 0) continue;
      let parsed: GeminiResponse;
      try {
        parsed = JSON.parse(event.data) as GeminiResponse;
      } catch {
        continue;
      }
      const delta = this.extract(parsed);
      if (delta.length > 0) {
        received = true;
        yield { delta, done: false };
      }
      usage = googleUsage(parsed.usageMetadata) ?? usage;
    }
    if (!received) {
      throw new TranslatorError("empty_response", `Provider "${this.id}" returned an empty stream`, {
        providerId: this.id,
      });
    }
    yield { delta: "", done: true, usage };
  }

  async listModels(): Promise<string[]> {
    const { data } = await requestJson<{ models?: { name?: string }[] }>({
      url: joinUrl(this.baseUrl, `/${this.apiVersion}/models`),
      method: "GET",
      headers: this.headers,
      timeoutMs: this.timeoutMs,
      fetchImpl: this.fetchImpl,
      providerId: this.id,
    });
    return (data.models ?? [])
      .map((entry) => entry.name?.replace(/^models\//, ""))
      .filter((id): id is string => Boolean(id));
  }
}

function googleUsage(metadata?: GeminiResponse["usageMetadata"]): TokenUsage | undefined {
  if (!metadata) return undefined;
  return {
    inputTokens: metadata.promptTokenCount,
    outputTokens: metadata.candidatesTokenCount,
    totalTokens: metadata.totalTokenCount,
  };
}

