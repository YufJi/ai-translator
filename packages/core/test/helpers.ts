export interface RecordedRequest {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: Record<string, unknown> | undefined;
}

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

export function sseResponse(frames: readonly string[]): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const frame of frames) controller.enqueue(encoder.encode(frame));
      controller.close();
    },
  });
  return new Response(stream, { status: 200, headers: { "content-type": "text/event-stream" } });
}

export interface FakeProviderOptions {
  /** Simulate a provider that echoes its input with a language marker. */
  marker?: (context: { system: string; user: string; body: Record<string, unknown> }) => string;
  detectAnswer?: string;
  failWith?: { status: number; message: string };
}

export interface FakeProvider {
  fetchImpl: typeof fetch;
  requests: RecordedRequest[];
  countMatching: (predicate: (request: RecordedRequest) => boolean) => number;
}

export function createFakeProvider(options: FakeProviderOptions = {}): FakeProvider {
  const requests: RecordedRequest[] = [];
  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const method = init?.method ?? "GET";
    const headers = Object.fromEntries(
      Object.entries((init?.headers ?? {}) as Record<string, string>).map(([key, value]) => [
        key.toLowerCase(),
        value,
      ]),
    );
    const body =
      typeof init?.body === "string" ? (JSON.parse(init.body) as Record<string, unknown>) : undefined;
    const request: RecordedRequest = { url, method, headers, body };
    requests.push(request);

    if (options.failWith) {
      return jsonResponse(
        { error: { message: options.failWith.message } },
        options.failWith.status,
      );
    }
    if (body?.stream === true) {
      const context = readContext(body);
      const text = options.marker ? options.marker(context) : `[out]${context.user}`;
      const frames = text
        .match(/.{1,6}/gs)!
        .map((piece) => `data: ${JSON.stringify({ model: "fake", choices: [{ delta: { content: piece } }] })}\n\n`);
      frames.push('data: {"model":"fake","choices":[{"delta":{},"finish_reason":"stop"}]}\n\n');
      frames.push("data: [DONE]\n\n");
      return sseResponse(frames);
    }
    if (method === "GET") {
      return jsonResponse({ data: [{ id: "fake-model" }, { id: "fake-model-mini" }] });
    }
    const context = readContext(body ?? {});
    if (context.system.includes("language identification engine")) {
      return jsonResponse({
        model: "fake",
        choices: [{ message: { content: options.detectAnswer ?? "ja" }, finish_reason: "stop" }],
      });
    }
    if (body?.response_format) {
      const segments = JSON.parse(context.user) as string[];
      return jsonResponse({
        model: "fake",
        choices: [
          {
            message: { content: JSON.stringify({ translations: segments.map((s) => `[json]${s}`) }) },
            finish_reason: "stop",
          },
        ],
        usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
      });
    }
    const text = options.marker ? options.marker(context) : `[out]${context.user}`;
    return jsonResponse({
      model: "fake-model",
      choices: [{ message: { content: text }, finish_reason: "stop" }],
      usage: { prompt_tokens: 5, completion_tokens: 7, total_tokens: 12 },
    });
  }) as typeof fetch;

  return {
    fetchImpl,
    requests,
    countMatching: (predicate) => requests.filter(predicate).length,
  };
}

function readContext(body: Record<string, unknown>): { system: string; user: string; body: Record<string, unknown> } {
  const messages = (body.messages ?? []) as { role: string; content: string }[];
  const system = messages.find((message) => message.role === "system")?.content ?? "";
  const user = messages[messages.length - 1]?.content ?? "";
  return { system, user, body };
}

