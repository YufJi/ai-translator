/// <reference types="chrome" />

import { Translator, isTranslatorError, type TranslationResult } from "@ai-translator/core";
import { errorMessage } from "@ai-translator/ui/format";
import type { BackgroundPush, ExtensionRequest, ExtensionResponse, TranslationPayload } from "./messages.ts";
import { getConfigStore } from "./store.ts";

const MENU_TRANSLATE_SELECTION = "ai-translator:translate-selection";

let translator: Translator | null = null;
let translatorConfigSignature = "";

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: MENU_TRANSLATE_SELECTION,
      title: "用 AI 翻译「%s」",
      contexts: ["selection"],
    });
  });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId !== MENU_TRANSLATE_SELECTION) return;
  const text = info.selectionText?.trim();
  if (!text || tab?.id === undefined) return;
  void translateAndPush(tab.id, text);
});

chrome.commands.onCommand.addListener(async (command) => {
  if (command !== "translate-selection") return;
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab?.id === undefined) return;
  try {
    const [injection] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => window.getSelection()?.toString() ?? "",
    });
    const text = typeof injection?.result === "string" ? injection.result.trim() : "";
    if (text) void translateAndPush(tab.id, text);
  } catch (error) {
    console.warn("[ai-translator] cannot read selection", error);
  }
});

chrome.runtime.onMessage.addListener((message: ExtensionRequest, _sender, sendResponse) => {
  if (message?.type !== "at:translate") return undefined;
  const tabId = _sender.tab?.id;
  void (async () => {
    const reply = (response: ExtensionResponse): void => {
      if (tabId !== undefined) {
        // Content scripts can lose the reply port when the service worker is
        // recycled; also drive their UI with an explicit push.
        void push(
          tabId,
          response.ok
            ? { type: "at:show-translation", payload: response.payload }
            : { type: "at:show-error", message: response.error },
        );
      }
      try {
        sendResponse(response);
      } catch (error) {
        console.warn("[ai-translator] reply port already closed", error);
      }
    };
    try {
      const result = await runTranslation(message.text, { from: message.from, to: message.to });
      reply({ ok: true, payload: toPayload(result) });
    } catch (error) {
      console.warn("[ai-translator] translation failed", error);
      reply({
        ok: false,
        error: errorMessage(error),
        ...(isTranslatorError(error) ? { code: error.code } : {}),
      });
    }
  })();
  return true;
});

interface RunOptions {
  from?: string;
  to?: string;
}

async function currentTranslator(): Promise<Translator> {
  const store = await getConfigStore();
  const config = store.load();
  const signature = JSON.stringify(config);
  if (!translator || signature !== translatorConfigSignature) {
    translator?.setConfig(config);
    translator ??= new Translator({ config });
    translatorConfigSignature = signature;
  }
  return translator;
}

async function runTranslation(text: string, options: RunOptions = {}): Promise<TranslationResult> {
  const activeTranslator = await currentTranslator();
  return activeTranslator.translate(text, {
    ...(options.from ? { from: options.from } : {}),
    ...(options.to ? { to: options.to } : {}),
  });
}

function toPayload(result: TranslationResult): TranslationPayload {
  return {
    source: result.source.language,
    translated: result.text,
    target: result.target,
    meta: [
      result.providerLabel,
      result.model,
      `${result.latencyMs}ms`,
      result.chunkCount > 1 ? `${result.chunkCount} 段` : "",
      result.cacheHit ? "缓存命中" : "",
    ]
      .filter(Boolean)
      .join(" · "),
  };
}

async function translateAndPush(tabId: number, text: string): Promise<void> {
  await push(tabId, { type: "at:show-loading", text });
  try {
    const result = await runTranslation(text);
    await push(tabId, { type: "at:show-translation", payload: toPayload(result) });
  } catch (error) {
    await push(tabId, { type: "at:show-error", message: errorMessage(error) });
  }
}

async function push(tabId: number, message: BackgroundPush): Promise<void> {
  try {
    await chrome.tabs.sendMessage(tabId, message);
  } catch {
    // The content script is unavailable (chrome:// pages, PDF viewer, ...).
  }
}
