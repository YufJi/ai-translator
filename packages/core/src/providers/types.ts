export type ProviderKind = "openai-compatible" | "anthropic" | "google" | "mock";

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ChatOptions {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  jsonMode?: boolean;
  signal?: AbortSignal;
  extraBody?: Record<string, unknown>;
}

export interface TokenUsage {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
}

export interface ChatResult {
  text: string;
  model: string;
  finishReason?: string;
  usage?: TokenUsage;
  raw?: unknown;
}

export interface ChatChunk {
  delta: string;
  done: boolean;
  usage?: TokenUsage;
}

export interface ProviderCapabilities {
  streaming: boolean;
  jsonMode: boolean;
  listModels: boolean;
}

export interface Provider {
  readonly id: string;
  readonly kind: ProviderKind;
  readonly label: string;
  readonly model: string;
  readonly capabilities: ProviderCapabilities;
  chat(messages: readonly ChatMessage[], options?: ChatOptions): Promise<ChatResult>;
  stream(messages: readonly ChatMessage[], options?: ChatOptions): AsyncGenerator<ChatChunk, void, void>;
  listModels(): Promise<string[]>;
}

export interface ProviderFactoryConfig {
  id: string;
  label?: string;
  model: string;
  baseUrl?: string;
  apiKey?: string;
  headers?: Record<string, string>;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

export type FetchLike = typeof fetch;

