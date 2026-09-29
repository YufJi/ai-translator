import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import {
  Translator,
  type AppConfig,
  type ConfigStore,
  type TranslatorEvent,
} from "@ai-translator/core";

/**
 * Subscribes to a config store so components re-render on every saved change.
 * The store returns a stable reference between saves, which keeps
 * useSyncExternalStore cheap.
 */
export function useConfig(store: ConfigStore): AppConfig {
  return useSyncExternalStore(
    (onStoreChange) => store.subscribe(() => onStoreChange()),
    () => store.load(),
    () => store.load(),
  );
}

export interface UseTranslatorResult {
  translator: Translator;
  lastEvent: TranslatorEvent | null;
}

/** Keeps a single Translator instance in sync with the current config. */
export function useTranslator(config: AppConfig, onEvent?: (event: TranslatorEvent) => void): UseTranslatorResult {
  const handler = useRef(onEvent);
  handler.current = onEvent;
  const [lastEvent, setLastEvent] = useState<TranslatorEvent | null>(null);

  const translator = useMemo(
    () =>
      new Translator({
        config,
        onEvent: (event) => {
          setLastEvent(event);
          handler.current?.(event);
        },
      }),
    // The translator is created once; config changes are pushed through setConfig.
    [],
  );

  useEffect(() => {
    translator.setConfig(config);
  }, [translator, config]);

  return { translator, lastEvent };
}

/** Debounces a value, used for auto-translate-on-type. */
export function useDebounced<T>(value: T, delayMs: number, enabled = true): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    if (!enabled) {
      setDebounced(value);
      return;
    }
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs, enabled]);
  return debounced;
}

export interface AsyncActionState {
  busy: boolean;
  error: string | null;
  run: (action: () => Promise<void>) => Promise<void>;
  setError: (message: string | null) => void;
}

export function useAsyncAction(): AsyncActionState {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = async (action: () => Promise<void>): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  };
  return { busy, error, run, setError };
}

