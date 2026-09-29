/**
 * A minimal `chrome.*` implementation so the extension's real entrypoints
 * (background.ts / content.ts / popup.ts / options.ts) can run in a plain page
 * against the offline demo provider. Used by the browser preview harness only.
 */

type AnyFn = (...args: never[]) => unknown;

export type PreviewRole = "background" | "content" | "popup" | "options";

interface StubState {
  role: PreviewRole;
  storage: Map<string, unknown>;
  backgroundListeners: AnyFn[];
  contentListeners: AnyFn[];
  installedListeners: AnyFn[];
  contextMenuListeners: AnyFn[];
  commandListeners: AnyFn[];
  storageChangedListeners: AnyFn[];
  contextMenus: { id?: string; title?: string }[];
  selectedText: string;
}

const state: StubState = {
  role: "popup",
  storage: new Map(),
  backgroundListeners: [],
  contentListeners: [],
  installedListeners: [],
  contextMenuListeners: [],
  commandListeners: [],
  storageChangedListeners: [],
  contextMenus: [],
  selectedText: "",
};

let staleContext = false;

/**
 * Simulates a content script whose extension context was invalidated by an
 * extension reload: `chrome.runtime.id` disappears and API calls throw.
 */
export function setPreviewStaleContext(value: boolean): void {
  staleContext = value;
}

export function setPreviewRole(role: PreviewRole): void {
  state.role = role;
}

export function setPreviewSelection(text: string): void {
  state.selectedText = text;
}

export function fireInstalled(): void {
  for (const listener of state.installedListeners) listener();
}

export function createdContextMenus(): { id?: string; title?: string }[] {
  return [...state.contextMenus];
}

export function triggerContextMenu(selectionText: string): void {
  for (const listener of state.contextMenuListeners) {
    (listener as (info: unknown, tab: unknown) => unknown)(
      { menuItemId: "ai-translator:translate-selection", selectionText },
      { id: 1 },
    );
  }
}

export function triggerCommand(command: string): void {
  for (const listener of state.commandListeners) listener(command as never);
}

function dispatch(
  listeners: AnyFn[],
  message: unknown,
  callback?: (response: unknown) => void,
  tab?: { id: number },
): boolean {
  let answered = false;
  const sendResponse = (response: unknown): void => {
    answered = true;
    callback?.(response);
  };
  // Mirrors Chrome: only content scripts carry `sender.tab`, which is what the
  // background uses to decide whether to push the result back to the page.
  const sender = { id: "preview", url: location.href, ...(tab ? { tab } : {}) };
  for (const listener of listeners) {
    const result = (listener as (m: unknown, s: unknown, r: unknown) => unknown)(
      message,
      sender,
      sendResponse,
    );
    if (result === true) return true;
  }
  if (!answered && listeners.length === 0) callback?.(undefined);
  return answered;
}

export function installChromeStub(seed: Record<string, unknown> = {}): void {
  for (const [key, value] of Object.entries(seed)) state.storage.set(key, value);
  const chromeApi = {
    runtime: {
      get id(): string | undefined {
        return staleContext ? undefined : "ai-translator-preview";
      },
      lastError: undefined as { message?: string } | undefined,
      getManifest: () => ({ version: "0.1.0-preview" }),
      onInstalled: { addListener: (fn: AnyFn) => void state.installedListeners.push(fn) },
      onMessage: {
        addListener: (fn: AnyFn) =>
          void (state.role === "content" ? state.contentListeners : state.backgroundListeners).push(fn),
      },
      sendMessage: (message: unknown, callback?: (response: unknown) => void) => {
        if (staleContext) throw new TypeError("Extension context invalidated.");
        return dispatch(
          state.backgroundListeners,
          message,
          callback,
          state.role === "content" ? { id: 1 } : undefined,
        );
      },
      openOptionsPage: () => void window.open("./options.html", "_blank"),
      getURL: (path: string) => new URL(path, location.href).href,
    },
    contextMenus: {
      create: (options: { id?: string; title?: string }) => void state.contextMenus.push(options),
      removeAll: (callback?: () => void) => {
        state.contextMenus = [];
        callback?.();
      },
      onClicked: { addListener: (fn: AnyFn) => void state.contextMenuListeners.push(fn) },
    },
    commands: { onCommand: { addListener: (fn: AnyFn) => void state.commandListeners.push(fn) } },
    tabs: {
      query: async () => [{ id: 1, url: location.href, active: true }],
      sendMessage: async (_tabId: number, message: unknown) => {
        dispatch(state.contentListeners, message);
      },
    },
    scripting: {
      executeScript: async () => [
        { result: window.getSelection()?.toString() || state.selectedText },
      ],
    },
    storage: {
      local: {
        get: async (keys?: string | string[]) => {
          if (typeof keys === "string") return { [keys]: state.storage.get(keys) };
          if (Array.isArray(keys)) {
            return Object.fromEntries(keys.map((key) => [key, state.storage.get(key)]));
          }
          return Object.fromEntries(state.storage);
        },
        set: async (values: Record<string, unknown>) => {
          const changes: Record<string, unknown> = {};
          for (const [key, value] of Object.entries(values)) {
            changes[key] = { oldValue: state.storage.get(key), newValue: value };
            state.storage.set(key, value);
          }
          for (const listener of state.storageChangedListeners) {
            (listener as (c: unknown, a: string) => unknown)(changes, "local");
          }
        },
      },
      onChanged: { addListener: (fn: AnyFn) => void state.storageChangedListeners.push(fn) },
    },
  };
  (globalThis as unknown as { chrome: unknown }).chrome = chromeApi;
}
