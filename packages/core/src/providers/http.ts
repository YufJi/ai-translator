import { TranslatorError, toTranslatorError } from "../errors.ts";
import type { FetchLike, TokenUsage } from "./types.ts";

export const DEFAULT_TIMEOUT_MS = 60_000;

export interface JsonRequestOptions {
  url: string;
  method?: string;
  headers?: Record<string, string>;
  body?: unknown;
  timeoutMs?: number;
  signal?: AbortSignal;
  fetchImpl?: FetchLike;
  providerId?: string;
}

export function combineSignals(
  signals: readonly (AbortSignal | undefined)[],
): AbortSignal | undefined {
  const active = signals.filter((signal): signal is AbortSignal => Boolean(signal));
  if (active.length === 0) return undefined;
  if (active.length === 1) return active[0];
  const anySignal = (AbortSignal as unknown as { any?: (s: AbortSignal[]) => AbortSignal }).any;
  if (typeof anySignal === "function") return anySignal(active);
  const controller = new AbortController();
  for (const signal of active) {
    if (signal.aborted) {
      controller.abort(signal.reason);
      break;
    }
    signal.addEventListener("abort", () => controller.abort(signal.reason), { once: true });
  }
  return controller.signal;
}

export function timeoutSignal(ms: number, providerId?: string): AbortSignal {
  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort(new TranslatorError("timeout", `Request timed out after ${ms}ms`, { providerId }));
  }, ms);
  if (typeof timer === "object" && "unref" in timer) {
    (timer as { unref: () => void }).unref();
  }
  return controller.signal;
}

export async function requestJson<T>(options: JsonRequestOptions): Promise<{ data: T; response: Response }> {
  const {
    url,
    method = "POST",
    headers = {},
    body,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    signal,
    fetchImpl = fetch,
    providerId,
  } = options;
  const combined = combineSignals([signal, timeoutSignal(timeoutMs, providerId)]);
  let response: Response;
  try {
    response = await fetchImpl(url, {
      method,
      headers: {
        ...(body === undefined ? {} : { "content-type": "application/json" }),
        ...headers,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: combined,
    });
  } catch (error) {
    throw toTranslatorError(error, providerId);
  }
  const text = await response.text();
  if (!response.ok) {
    throw TranslatorError.fromStatus(response.status, extractErrorMessage(text, response.status), providerId);
  }
  try {
    return { data: (text.length === 0 ? {} : JSON.parse(text)) as T, response };
  } catch (error) {
    throw new TranslatorError("unknown", `Provider returned a non-JSON response: ${text.slice(0, 200)}`, {
      providerId,
      cause: error,
    });
  }
}

export interface SseEvent {
  event?: string;
  data: string;
}

export async function* requestSse(
  options: Omit<JsonRequestOptions, "method"> & { method?: string },
): AsyncGenerator<SseEvent, void, void> {
  const {
    url,
    method = "POST",
    headers = {},
    body,
    timeoutMs = DEFAULT_TIMEOUT_MS * 4,
    signal,
    fetchImpl = fetch,
    providerId,
  } = options;
  const combined = combineSignals([signal, timeoutSignal(timeoutMs, providerId)]);
  let response: Response;
  try {
    response = await fetchImpl(url, {
      method,
      headers: {
        accept: "text/event-stream",
        ...(body === undefined ? {} : { "content-type": "application/json" }),
        ...headers,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: combined,
    });
  } catch (error) {
    throw toTranslatorError(error, providerId);
  }
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw TranslatorError.fromStatus(response.status, extractErrorMessage(text, response.status), providerId);
  }
  if (!response.body) {
    throw new TranslatorError("empty_response", "Provider returned an empty stream", { providerId });
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const blocks = buffer.split(/\r?\n\r?\n/);
      buffer = blocks.pop() ?? "";
      for (const block of blocks) {
        const event = parseSseBlock(block);
        if (event) yield event;
      }
    }
    buffer += decoder.decode();
    if (buffer.trim().length > 0) {
      const event = parseSseBlock(buffer);
      if (event) yield event;
    }
  } finally {
    reader.releaseLock?.();
  }
}

function parseSseBlock(block: string): SseEvent | undefined {
  let event: string | undefined;
  const dataLines: string[] = [];
  for (const rawLine of block.split(/\r?\n/)) {
    const line = rawLine.trimEnd();
    if (line.length === 0 || line.startsWith(":")) continue;
    if (line.startsWith("event:")) {
      event = line.slice(6).trim();
      continue;
    }
    if (line.startsWith("data:")) {
      dataLines.push(line.slice(5).replace(/^ /, ""));
    }
  }
  if (dataLines.length === 0) return undefined;
  return event === undefined ? { data: dataLines.join("\n") } : { event, data: dataLines.join("\n") };
}

function extractErrorMessage(text: string, status: number): string {
  if (!text) return `HTTP ${status}`;
  try {
    const parsed = JSON.parse(text) as {
      error?: { message?: string } | string;
      message?: string;
    };
    if (typeof parsed.error === "string") return parsed.error;
    if (parsed.error?.message) return parsed.error.message;
    if (parsed.message) return parsed.message;
  } catch {
    /* fall through to raw text */
  }
  return text.slice(0, 400);
}

export function normalizeUsage(usage: unknown): TokenUsage | undefined {
  if (!usage || typeof usage !== "object") return undefined;
  const record = usage as Record<string, number | undefined>;
  const inputTokens = record.prompt_tokens ?? record.input_tokens;
  const outputTokens = record.completion_tokens ?? record.output_tokens;
  const totalTokens = record.total_tokens;
  if (inputTokens === undefined && outputTokens === undefined && totalTokens === undefined) {
    return undefined;
  }
  return { inputTokens, outputTokens, totalTokens: totalTokens ?? (inputTokens ?? 0) + (outputTokens ?? 0) };
}

export function joinUrl(baseUrl: string, path: string): string {
  if (/^https?:\/\//i.test(path)) return path;
  return `${baseUrl.replace(/\/+$/, "")}/${path.replace(/^\/+/, "")}`;
}
