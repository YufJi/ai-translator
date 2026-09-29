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

export interface AnthropicConfig extends ProviderFactoryConfig {
  apiVersion?: string;
  defaultMaxTokens?: number;
  extraBody?: Record<string, unknown>;
}

const DEFAULT_MAX_TOKENS = 4096;

export class AnthropicProvider implements Provider {
  readonly kind = "anthropic" as const;
  readonly capabilities: ProviderCapabilities = {
    streaming: true,
    jsonMode: false,
    listModels: true,
  };
  readonly id: string;
  readonly label: string;
  readonly model: string;

  private readonly baseUrl: string;
  private readonly headers: Record<string, string>;
  private readonly apiVersion: string;
  private readonly defaultMaxTokens: number;
  private readonly extraBody: Record<string, unknown>;
  private readonly timeoutMs: number;
  private readonly fetchImpl: FetchLike;

  constructor(config: AnthropicConfig = { model: "" } as AnthropicConfig) {
    this.id = config.id;
    this.model = config.model;
    this.label = config.label ?? config.id;
    this.baseUrl = (config.baseUrl ?? "https://api.anthropic.com").replace(/\/+$/, "");
    this.apiVersion = config.apiVersion ?? "2023-06-01";
    this.defaultMaxTokens = config.defaultMaxTokens ?? DEFAULT_MAX_TOKENS;
    this.extraBody = config.extraBody ?? {};
    this.timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.fetchImpl = config.fetchImpl ?? fetch;
    this.headers = {
      "anthropic-version": this.apiVersion,
      ...(config.apiKey ? { "x-api-key": config.apiKey } : {}),
      ...(config.headers ?? {}),
    };
  }

  private buildBody(messages: readonly ChatMessage[], options: ChatOptions, stream: boolean) {
    const model = options.model ?? this.model;
    if (!model) {
      throw new TranslatorError("config_invalid", `Provider "${this.id}" has no model configured`, {
        providerId: this.id,
      });
    }
    const system = messages
      .filter((message) => message.role === "system")
      .map((message) => message.content)
      .join("\n\n");
    const conversation = messages
      .filter((message) => message.role !== "system")
      .map((message) => ({ role: message.role, content: message.content }));
    return {
      model,
      max_tokens: options.maxTokens ?? this.defaultMaxTokens,
      messages: conversation.length > 0 ? conversation : [{ role: "user", content: "" }],
      ...(system ? { system } : {}),
      ...(options.temperature === undefined ? {} : { temperature: options.temperature }),
      ...(stream ? { stream: true } : {}),
      ...this.extraBody,
      ...(options.extraBody ?? {}),
    };
  }

  async chat(messages: readonly ChatMessage[], options: ChatOptions = {}): Promise<ChatResult> {
    const { data } = await requestJson<{
      model?: string;
      content?: { type?: string; text?: string }[];
      stop_reason?: string;
      usage?: { input_tokens?: number; output_tokens?: number };
    }>({
      url: joinUrl(this.baseUrl, "/v1/messages"),
      headers: this.headers,
      body: this.buildBody(messages, options, false),
      timeoutMs: this.timeoutMs,
      signal: options.signal,
      fetchImpl: this.fetchImpl,
      providerId: this.id,
    });
    const text = (data.content ?? [])
      .filter((part) => part.type === "text" || part.text !== undefined)
      .map((part) => part.text ?? "")
      .join("");
    if (!text.trim()) {
      throw new TranslatorError("empty_response", `Provider "${this.id}" returned an empty translation`, {
        providerId: this.id,
      });
    }
    return {
      text,
      model: data.model ?? options.model ?? this.model,
      finishReason: data.stop_reason,
      usage: anthropicUsage(data.usage),
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
      url: joinUrl(this.baseUrl, "/v1/messages"),
      headers: this.headers,
      body: this.buildBody(messages, options, true),
      timeoutMs: this.timeoutMs * 4,
      signal: options.signal,
      fetchImpl: this.fetchImpl,
      providerId: this.id,
    })) {
      if (event.data.trim().length === 0) continue;
      let parsed: {
        type?: string;
        delta?: { type?: string; text?: string; stop_reason?: string };
        usage?: { input_tokens?: number; output_tokens?: number };
        error?: { message?: string };
      };
      try {
        parsed = JSON.parse(event.data) as typeof parsed;
      } catch {
        continue;
      }
      if (parsed.type === "error") {
        throw new TranslatorError("server_error", parsed.error?.message ?? "Anthropic streaming error", {
          providerId: this.id,
        });
      }
      if (parsed.usage) usage = anthropicUsage(parsed.usage) ?? usage;
      const delta = parsed.delta?.text;
      if (typeof delta === "string" && delta.length > 0) {
        received = true;
        yield { delta, done: false };
      }
      if (parsed.type === "message_stop") break;
    }
    if (!received) {
      throw new TranslatorError("empty_response", `Provider "${this.id}" returned an empty stream`, {
        providerId: this.id,
      });
    }
    yield { delta: "", done: true, usage };
  }

  async listModels(): Promise<string[]> {
    const { data } = await requestJson<{ data?: { id?: string }[] }>({
      url: joinUrl(this.baseUrl, "/v1/models"),
      method: "GET",
      headers: this.headers,
      timeoutMs: this.timeoutMs,
      fetchImpl: this.fetchImpl,
      providerId: this.id,
    });
    return (data.data ?? [])
      .map((entry) => entry.id)
      .filter((id): id is string => typeof id === "string" && id.length > 0);
  }
}

function anthropicUsage(usage?: { input_tokens?: number; output_tokens?: number }): TokenUsage | undefined {
  if (!usage) return undefined;
  const inputTokens = usage.input_tokens;
  const outputTokens = usage.output_tokens;
  if (inputTokens === undefined && outputTokens === undefined) return undefined;
  return { inputTokens, outputTokens, totalTokens: (inputTokens ?? 0) + (outputTokens ?? 0) };
}

