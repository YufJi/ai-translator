import { TranslatorError } from "../errors.ts";
import { DEFAULT_TIMEOUT_MS, joinUrl, normalizeUsage, requestJson, requestSse } from "./http.ts";
import type {
  ChatChunk,
  ChatMessage,
  ChatOptions,
  ChatResult,
  FetchLike,
  Provider,
  ProviderCapabilities,
  ProviderFactoryConfig,
} from "./types.ts";

export interface OpenAiCompatibleConfig extends ProviderFactoryConfig {
  path?: string;
  modelsPath?: string;
  apiKeyHeader?: string;
  apiKeyPrefix?: string;
  streamUsage?: boolean;
  organization?: string;
  defaultMaxTokens?: number;
  extraBody?: Record<string, unknown>;
  capabilities?: Partial<ProviderCapabilities>;
}

interface OpenAiChoice {
  message?: { content?: unknown };
  delta?: { content?: unknown };
  finish_reason?: string | null;
}

interface OpenAiResponse {
  model?: string;
  choices?: OpenAiChoice[];
  usage?: unknown;
}

export function extractOpenAiText(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === "string") return part;
        if (part && typeof part === "object" && typeof (part as { text?: unknown }).text === "string") {
          return (part as { text: string }).text;
        }
        return "";
      })
      .join("");
  }
  if (content === null || content === undefined) return "";
  return String(content);
}

export class OpenAiCompatibleProvider implements Provider {
  readonly kind = "openai-compatible" as const;
  readonly id: string;
  readonly label: string;
  readonly model: string;
  readonly capabilities: ProviderCapabilities;

  private readonly baseUrl: string;
  private readonly apiKey?: string;
  private readonly path: string;
  private readonly modelsPath: string;
  private readonly headers: Record<string, string>;
  private readonly streamUsage: boolean;
  private readonly defaultMaxTokens?: number;
  private readonly extraBody: Record<string, unknown>;
  private readonly timeoutMs: number;
  private readonly fetchImpl: FetchLike;

  constructor(config: OpenAiCompatibleConfig = { model: "" } as OpenAiCompatibleConfig) {
    this.id = config.id;
    this.model = config.model;
    this.label = config.label ?? config.id;
    this.baseUrl = (config.baseUrl ?? "https://api.openai.com/v1").replace(/\/+$/, "");
    this.apiKey = config.apiKey;
    this.path = config.path ?? "/chat/completions";
    this.modelsPath = config.modelsPath ?? "/models";
    this.streamUsage = config.streamUsage ?? false;
    this.defaultMaxTokens = config.defaultMaxTokens;
    this.extraBody = config.extraBody ?? {};
    this.timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.fetchImpl = config.fetchImpl ?? fetch;
    this.capabilities = {
      streaming: true,
      jsonMode: true,
      listModels: true,
      ...config.capabilities,
    };
    this.headers = { ...(config.headers ?? {}) };
    if (this.apiKey && !this.headers[config.apiKeyHeader ?? "authorization"]) {
      this.headers[config.apiKeyHeader ?? "authorization"] = `${config.apiKeyPrefix ?? "Bearer "}${this.apiKey}`;
    }
    if (config.organization) this.headers["openai-organization"] = config.organization;
  }

  private endpoint(path: string): string {
    return joinUrl(this.baseUrl, path);
  }

  private buildBody(messages: readonly ChatMessage[], options: ChatOptions, stream: boolean): Record<string, unknown> {
    const model = options.model ?? this.model;
    if (!model) {
      throw new TranslatorError("config_invalid", `Provider "${this.id}" has no model configured`, {
        providerId: this.id,
      });
    }
    const maxTokens = options.maxTokens ?? this.defaultMaxTokens;
    return {
      model,
      messages: messages.map((message) => ({ role: message.role, content: message.content })),
      ...(options.temperature === undefined ? {} : { temperature: options.temperature }),
      ...(maxTokens === undefined ? {} : { max_tokens: maxTokens }),
      ...(options.jsonMode ? { response_format: { type: "json_object" } } : {}),
      ...(stream ? { stream: true } : {}),
      ...(stream && this.streamUsage ? { stream_options: { include_usage: true } } : {}),
      ...this.extraBody,
      ...(options.extraBody ?? {}),
    };
  }

  async chat(messages: readonly ChatMessage[], options: ChatOptions = {}): Promise<ChatResult> {
    const { data } = await requestJson<OpenAiResponse>({
      url: this.endpoint(this.path),
      headers: this.headers,
      body: this.buildBody(messages, options, false),
      timeoutMs: this.timeoutMs,
      signal: options.signal,
      fetchImpl: this.fetchImpl,
      providerId: this.id,
    });
    const choice = data.choices?.[0];
    const text = extractOpenAiText(choice?.message?.content);
    if (!text.trim()) {
      throw new TranslatorError("empty_response", `Provider "${this.id}" returned an empty translation`, {
        providerId: this.id,
      });
    }
    return {
      text,
      model: data.model ?? options.model ?? this.model,
      finishReason: choice?.finish_reason ?? undefined,
      usage: normalizeUsage(data.usage),
      raw: data,
    };
  }

  async *stream(
    messages: readonly ChatMessage[],
    options: ChatOptions = {},
  ): AsyncGenerator<ChatChunk, void, void> {
    const events = requestSse({
      url: this.endpoint(this.path),
      headers: this.headers,
      body: this.buildBody(messages, options, true),
      timeoutMs: this.timeoutMs * 4,
      signal: options.signal,
      fetchImpl: this.fetchImpl,
      providerId: this.id,
    });
    let received = false;
    for await (const event of events) {
      const payload = event.data.trim();
      if (payload === "[DONE]") break;
      if (payload.length === 0) continue;
      let parsed: OpenAiResponse;
      try {
        parsed = JSON.parse(payload) as OpenAiResponse;
      } catch {
        continue;
      }
      const delta = extractOpenAiText(parsed.choices?.[0]?.delta?.content);
      const usage = normalizeUsage(parsed.usage);
      if (delta.length > 0) {
        received = true;
        yield { delta, done: false };
      }
      if (usage) yield { delta: "", done: false, usage };
    }
    if (!received) {
      throw new TranslatorError("empty_response", `Provider "${this.id}" returned an empty stream`, {
        providerId: this.id,
      });
    }
    yield { delta: "", done: true };
  }

  async listModels(): Promise<string[]> {
    const { data } = await requestJson<{ data?: { id?: string }[] }>({
      url: this.endpoint(this.modelsPath),
      method: "GET",
      headers: this.headers,
      timeoutMs: this.timeoutMs,
      fetchImpl: this.fetchImpl,
      providerId: this.id,
    });
    return (data.data ?? [])
      .map((entry) => entry.id)
      .filter((id): id is string => typeof id === "string" && id.length > 0)
      .sort((a, b) => a.localeCompare(b));
  }
}

