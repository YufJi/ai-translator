import { defaultConfig, parseConfig, type AppConfig, type ValidationResult } from "./config.ts";

export const CONFIG_STORAGE_KEY = "ai-translator:config:v1";

export interface ConfigStore {
  load(): AppConfig;
  save(config: AppConfig): void;
  subscribe(listener: (config: AppConfig) => void): () => void;
  reset(): AppConfig;
}

export class MemoryConfigStore implements ConfigStore {
  private config: AppConfig;
  private readonly listeners = new Set<(config: AppConfig) => void>();

  constructor(initial?: AppConfig) {
    this.config = initial ? parseConfig(initial).config : defaultConfig();
  }

  load(): AppConfig {
    return this.config;
  }

  save(config: AppConfig): void {
    const result = parseConfig(config);
    this.config = result.config;
    for (const listener of this.listeners) listener(this.config);
  }

  subscribe(listener: (config: AppConfig) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  reset(): AppConfig {
    this.save(defaultConfig());
    return this.config;
  }
}

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export class LocalStorageConfigStore implements ConfigStore {
  private readonly storage: StorageLike;
  private readonly key: string;
  private readonly listeners = new Set<(config: AppConfig) => void>();
  private cache: AppConfig;

  constructor(storage: StorageLike, key = CONFIG_STORAGE_KEY) {
    this.storage = storage;
    this.key = key;
    this.cache = this.read();
  }

  private read(): AppConfig {
    const raw = this.storage.getItem(this.key);
    if (!raw) return defaultConfig();
    const result: ValidationResult = parseConfig(raw);
    if (!result.ok) return defaultConfig();
    return result.config;
  }

  load(): AppConfig {
    this.cache = this.read();
    return this.cache;
  }

  save(config: AppConfig): void {
    const result = parseConfig(config);
    this.cache = result.config;
    this.storage.setItem(this.key, JSON.stringify(result.config));
    for (const listener of this.listeners) listener(this.cache);
  }

  subscribe(listener: (config: AppConfig) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  reset(): AppConfig {
    this.storage.removeItem(this.key);
    return this.load();
  }
}

export function createLocalConfigStore(): ConfigStore {
  const storage = (globalThis as { localStorage?: StorageLike }).localStorage;
  if (!storage) return new MemoryConfigStore();
  return new LocalStorageConfigStore(storage);
}
