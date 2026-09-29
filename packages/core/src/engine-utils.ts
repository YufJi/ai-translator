import type { ProviderConfig } from "./config.ts";
import type { ChatMessage, Provider, TokenUsage } from "./providers/types.ts";
import { cleanModelOutput, type ProtectedText } from "./text.ts";

export const DEFAULT_CONCURRENCY = 3;
export const JSON_BATCH_LIMIT = 8;
export const LLM_DETECT_SAMPLE = 900;

export function providerIdentity(config: ProviderConfig): string {
  return JSON.stringify([
    config.kind,
    config.model,
    config.baseUrl ?? "",
    config.apiKey ?? "",
    config.path ?? "",
    config.apiKeyHeader ?? "",
    config.apiKeyPrefix ?? "",
    config.headers ?? {},
    config.body ?? {},
    config.timeoutMs ?? 0,
    config.presetId ?? "",
  ]);
}

const TOKEN_PATTERN = /\uE000\s*(\d+)\s*\uE001|\[\[T\s*(\d+)\s*\]\]/g;

export function expectedTokenIds(text: string): string[] {
  const ids: string[] = [];
  TOKEN_PATTERN.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = TOKEN_PATTERN.exec(text)) !== null) {
    ids.push(match[1] ?? match[2] ?? "");
  }
  return ids;
}

export function mergeUsage(
  a: TokenUsage | undefined,
  b: TokenUsage | undefined,
): TokenUsage | undefined {
  if (!a) return b;
  if (!b) return a;
  return {
    inputTokens: (a.inputTokens ?? 0) + (b.inputTokens ?? 0),
    outputTokens: (a.outputTokens ?? 0) + (b.outputTokens ?? 0),
    totalTokens: (a.totalTokens ?? 0) + (b.totalTokens ?? 0),
  };
}

export async function mapLimit<T, R>(
  items: readonly T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;
  const size = Math.max(1, Math.min(limit, items.length));
  await Promise.all(
    Array.from({ length: size }, async () => {
      while (true) {
        const index = cursor;
        cursor += 1;
        if (index >= items.length) return;
        results[index] = await worker(items[index]!, index);
      }
    }),
  );
  return results;
}

export function hasTranslatableContent(text: string): boolean {
  return /\p{L}/u.test(text);
}

export interface RestoreResult {
  text: string;
  integrityOk: boolean;
}

export function restoreWithGuard(
  raw: string,
  guard: ProtectedText,
  index: number,
  warnings: string[],
): RestoreResult {
  const expected = expectedTokenIds(guard.text);
  const actual = expectedTokenIds(raw);
  const integrityOk =
    expected.length === actual.length && expected.every((id, position) => id === actual[position]);
  if (!integrityOk) {
    const seen = new Set(actual);
    const missing = expected.filter((id) => !seen.has(id));
    warnings.push(
      missing.length > 0
        ? `chunk ${index}: ${missing.length} placeholder(s) were dropped by the model`
        : `chunk ${index}: placeholder order or numbering changed`,
    );
  }
  const cleaned = cleanModelOutput(raw);
  const body = guard.tokens.length > 0 ? guard.restore(cleaned) : cleaned;
  return { text: preserveBoundaryWhitespace(guard.text, body), integrityOk };
}

function preserveBoundaryWhitespace(source: string, body: string): string {
  const leading = /^\s*/.exec(source)?.[0] ?? "";
  const trailing = /\s*$/.exec(source)?.[0] ?? "";
  return `${leading}${body}${trailing}`;
}

export interface SegmentRequest {
  provider: Provider;
  systemPrompt: string;
  guard: ProtectedText;
  temperature: number;
  maxTokens?: number;
  signal?: AbortSignal;
  index: number;
  warnings: string[];
  onRetry?: (reason: string, index: number) => void;
}

export interface SegmentResponse {
  text: string;
  usage?: TokenUsage;
  integrityOk: boolean;
}

const STRICT_REMINDER =
  "IMPORTANT: the previous attempt damaged the placeholder tokens. Copy every token such as \uE0000\uE001 exactly as written, keeping the same numbers and positions.";

export async function runSegment(request: SegmentRequest): Promise<SegmentResponse> {
  const user: ChatMessage = { role: "user", content: request.guard.text };
  const call = async (strict: boolean) => {
    const system = strict ? `${request.systemPrompt}\n\n${STRICT_REMINDER}` : request.systemPrompt;
    const response = await request.provider.chat(
      [{ role: "system", content: system }, user],
      {
        temperature: request.temperature,
        ...(request.maxTokens ? { maxTokens: request.maxTokens } : {}),
        ...(request.signal ? { signal: request.signal } : {}),
      },
    );
    return response;
  };

  let response = await call(false);
  let restored = restoreWithGuard(response.text, request.guard, request.index, request.warnings);
  if (!restored.integrityOk) {
    request.onRetry?.("placeholder-mismatch", request.index);
    response = await call(true);
    restored = restoreWithGuard(response.text, request.guard, request.index, request.warnings);
  }
  return {
    text: restored.text,
    integrityOk: restored.integrityOk,
    ...(response.usage ? { usage: response.usage } : {}),
  };
}
