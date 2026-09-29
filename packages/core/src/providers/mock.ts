import type {
  ChatChunk,
  ChatMessage,
  ChatOptions,
  ChatResult,
  Provider,
  ProviderCapabilities,
  ProviderFactoryConfig,
} from "./types.ts";

export interface MockConfig extends ProviderFactoryConfig {
  latencyMs?: number;
  dictionary?: Record<string, string>;
}

export const DEFAULT_MOCK_DICTIONARY: Record<string, string> = {
  hello: "你好",
  "hello world": "你好，世界",
  "good morning": "早上好",
  "thank you": "谢谢",
  goodbye: "再见",
  "how are you?": "你好吗？",
  你好: "Hello",
  你好世界: "Hello world",
  早上好: "Good morning",
  谢谢: "Thank you",
  再见: "Goodbye",
  こんにちは: "你好",
  おはようございます: "早上好",
  ありがとう: "谢谢",
};

export class MockProvider implements Provider {
  readonly kind = "mock" as const;
  readonly capabilities: ProviderCapabilities = {
    streaming: true,
    jsonMode: true,
    listModels: true,
  };
  readonly id: string;
  readonly label: string;
  readonly model: string;

  private readonly latencyMs: number;
  private readonly dictionary: Record<string, string>;

  constructor(config: MockConfig = { model: "mock-1" } as MockConfig) {
    this.id = config.id ?? "mock";
    this.model = config.model || "mock-1";
    this.label = config.label ?? "Offline demo provider";
    this.latencyMs = config.latencyMs ?? 120;
    this.dictionary = config.dictionary ?? DEFAULT_MOCK_DICTIONARY;
  }

  private translate(messages: readonly ChatMessage[]): string {
    const targetMatch = /into (.+?)\./.exec(messages[0]?.content ?? "");
    const target = targetMatch?.[1]?.trim();
    const source = messages[messages.length - 1]?.content ?? "";
    const key = source.trim().toLowerCase();
    const hit = this.dictionary[key] ?? this.dictionary[source.trim()];
    if (hit) return hit;
    if (target) return `[${target} · mock] ${source}`;
    return `[mock] ${source}`;
  }

  async chat(messages: readonly ChatMessage[], options: ChatOptions = {}): Promise<ChatResult> {
    await this.delay(options);
    const text = this.translate(messages);
    return {
      text,
      model: options.model ?? this.model,
      finishReason: "stop",
      usage: { inputTokens: messages.length, outputTokens: 1, totalTokens: messages.length + 1 },
    };
  }

  async *stream(
    messages: readonly ChatMessage[],
    options: ChatOptions = {},
  ): AsyncGenerator<ChatChunk, void, void> {
    const text = await this.chat(messages, options);
    const pieces = text.text.match(/.{1,8}/gs) ?? [text.text];
    for (const piece of pieces) {
      yield { delta: piece, done: false };
    }
    yield { delta: "", done: true, usage: text.usage };
  }

  async listModels(): Promise<string[]> {
    return [this.model, "mock-2"];
  }

  private async delay(options: ChatOptions): Promise<void> {
    if (this.latencyMs <= 0) return;
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(resolve, this.latencyMs);
      options.signal?.addEventListener(
        "abort",
        () => {
          clearTimeout(timer);
          reject(new Error("AbortError", { cause: "aborted" }));
        },
        { once: true },
      );
    });
  }
}
