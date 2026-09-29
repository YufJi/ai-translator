import { hashKey, stableStringify } from "./hash.ts";

export interface CacheOptions {
  maxEntries?: number;
  ttlMs?: number;
}

export interface CacheStats {
  size: number;
  hits: number;
  misses: number;
  evictions: number;
  expired: number;
}

interface Entry<V> {
  value: V;
  createdAt: number;
}

export class LruCache<V> {
  private readonly store = new Map<string, Entry<V>>();
  private readonly maxEntries: number;
  private readonly ttlMs?: number;
  private hits = 0;
  private misses = 0;
  private evictions = 0;
  private expired = 0;

  constructor(options: CacheOptions = {}) {
    this.maxEntries = Math.max(0, options.maxEntries ?? 500);
    this.ttlMs = options.ttlMs;
  }

  get size(): number {
    return this.store.size;
  }

  get(key: string): V | undefined {
    const entry = this.store.get(key);
    if (!entry) {
      this.misses += 1;
      return undefined;
    }
    if (this.ttlMs !== undefined && Date.now() - entry.createdAt > this.ttlMs) {
      this.store.delete(key);
      this.expired += 1;
      this.misses += 1;
      return undefined;
    }
    this.store.delete(key);
    this.store.set(key, entry);
    this.hits += 1;
    return entry.value;
  }

  has(key: string): boolean {
    return this.get(key) !== undefined;
  }

  set(key: string, value: V): void {
    if (this.maxEntries === 0) return;
    if (this.store.has(key)) this.store.delete(key);
    this.store.set(key, { value, createdAt: Date.now() });
    while (this.store.size > this.maxEntries) {
      const oldest = this.store.keys().next();
      if (oldest.done) break;
      this.store.delete(oldest.value);
      this.evictions += 1;
    }
  }

  delete(key: string): boolean {
    return this.store.delete(key);
  }

  clear(): void {
    this.store.clear();
  }

  stats(): CacheStats {
    return {
      size: this.store.size,
      hits: this.hits,
      misses: this.misses,
      evictions: this.evictions,
      expired: this.expired,
    };
  }

  entries(): [string, V][] {
    return [...this.store.entries()].map(([key, entry]) => [key, entry.value]);
  }

  load(entries: Iterable<[string, V]>): void {
    for (const [key, value] of entries) this.set(key, value);
  }
}

export interface TranslationCacheKeyInput {
  providerId: string;
  model: string;
  from: string;
  to: string;
  text: string;
  tone?: string;
  domain?: string;
  audience?: string;
  glossary?: unknown;
  systemPrompt?: string;
  temperature?: number;
}

export function translationCacheKey(input: TranslationCacheKeyInput): string {
  return hashKey([
    input.providerId,
    input.model,
    input.from.toLowerCase(),
    input.to.toLowerCase(),
    input.tone ?? "",
    input.domain ?? "",
    input.audience ?? "",
    input.temperature === undefined ? "" : String(input.temperature),
    input.glossary ? hashKey([stableStringify(input.glossary)]) : "",
    input.systemPrompt ? hashKey([input.systemPrompt]) : "",
    hashKey([input.text]),
  ]);
}

export class TranslationCache extends LruCache<{ text: string }> {}

