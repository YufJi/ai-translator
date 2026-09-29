/// <reference types="chrome" />

import {
  defaultConfig,
  parseConfig,
  type AppConfig,
  type ConfigStore,
} from "../../../packages/core/src/index.ts";
import { CONFIG_STORAGE_KEY } from "./messages.ts";

/**
 * chrome.storage.local is asynchronous, so the store hydrates once at startup and
 * then behaves like the synchronous store the rest of the app expects.
 */
export class ChromeConfigStore implements ConfigStore {
  private config: AppConfig;
  private readonly listeners = new Set<(config: AppConfig) => void>();

  private constructor(config: AppConfig) {
    this.config = config;
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== "local" || !changes[CONFIG_STORAGE_KEY]) return;
      this.config = parseConfig(changes[CONFIG_STORAGE_KEY]!.newValue).config;
      for (const listener of this.listeners) listener(this.config);
    });
  }

  static async create(): Promise<ChromeConfigStore> {
    const stored = await chrome.storage.local.get(CONFIG_STORAGE_KEY);
    const raw = stored[CONFIG_STORAGE_KEY];
    return new ChromeConfigStore(parseConfig(raw ?? defaultConfig()).config);
  }

  load(): AppConfig {
    return this.config;
  }

  save(config: AppConfig): void {
    const parsed = parseConfig(config).config;
    this.config = parsed;
    void chrome.storage.local.set({ [CONFIG_STORAGE_KEY]: parsed });
    for (const listener of this.listeners) listener(parsed);
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

let cached: Promise<ChromeConfigStore> | undefined;

export function getConfigStore(): Promise<ChromeConfigStore> {
  cached ??= ChromeConfigStore.create();
  return cached;
}
