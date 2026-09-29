/// <reference types="chrome" />

import {
  activeProviderLabel,
  copyText,
  errorMessage,
  fillLanguageSelect,
  h,
} from "../../../packages/ui/src/index.ts";
import type { ExtensionRequest, ExtensionResponse } from "./messages.ts";
import { getConfigStore } from "./store.ts";

const store = await getConfigStore();
const config = store.load();
let lastText = "";

const providerBadge = h("span", { class: "at-badge" }, activeProviderLabel(config));
const fromSelect = h("select", { class: "at-select" });
const toSelect = h("select", { class: "at-select" });
fillLanguageSelect(fromSelect, {
  includeAuto: true,
  selected: config.settings.autoDetect ? "auto" : config.settings.sourceLanguage,
});
fillLanguageSelect(toSelect, { includeAuto: false, selected: config.settings.targetLanguage });
fromSelect.value = config.settings.autoDetect ? "auto" : config.settings.sourceLanguage;
toSelect.value = config.settings.targetLanguage;

const inputArea = h("textarea", { placeholder: "输入要翻译的内容…", spellcheck: "false" }) as HTMLTextAreaElement;
const resultArea = h("div", { class: "at-popup__result at-popup__result--placeholder" }, "翻译结果会显示在这里。");
const metaLine = h("span", {});
const detectionLine = h("span", {});
const errorLine = h("p", { class: "at-popup__error at-hidden" });
const translateButton = h("button", { class: "at-btn", onclick: () => void translate() }, "翻译");
const copyButton = h("button", { class: "at-btn at-btn--ghost", onclick: () => void copy() }, "复制");

function setError(message: string | null): void {
  errorLine.textContent = message ?? "";
  errorLine.classList.toggle("at-hidden", message === null);
}

function setBusy(busy: boolean): void {
  translateButton.disabled = busy;
  translateButton.textContent = busy ? "翻译中…" : "翻译";
}

async function translate(): Promise<void> {
  const text = inputArea.value.trim();
  if (!text) {
    setError("请先输入内容。");
    return;
  }
  setError(null);
  setBusy(true);
  resultArea.textContent = "正在翻译…";
  resultArea.classList.add("at-popup__result--placeholder");
  try {
    const response = await sendRequest({
      type: "at:translate",
      text,
      from: fromSelect.value,
      to: toSelect.value,
    });
    if (!response.ok) {
      setError(response.error);
      resultArea.textContent = "翻译失败。";
      return;
    }
    lastText = response.payload.translated;
    resultArea.textContent = response.payload.translated;
    resultArea.classList.remove("at-popup__result--placeholder");
    metaLine.textContent = response.payload.meta;
    detectionLine.textContent = `${response.payload.source} → ${response.payload.target}`;
  } catch (error) {
    setError(errorMessage(error));
  } finally {
    setBusy(false);
  }
}

async function copy(): Promise<void> {
  if (!lastText) return;
  const ok = await copyText(lastText);
  setError(ok ? null : "复制失败，请手动选择文本。");
}

function sendRequest(request: ExtensionRequest): Promise<ExtensionResponse> {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(request, (response: ExtensionResponse | undefined) => {
      if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
      else if (!response) reject(new Error("扩展后台未响应"));
      else resolve(response);
    });
  });
}

const app = h("section", {},
  h("header", { class: "at-popup__head" },
    h("h1", { class: "at-popup__title" }, "AI 翻译"),
    h("div", { class: "at-row" }, providerBadge,
      h("button", { class: "at-btn at-btn--ghost", onclick: () => chrome.runtime.openOptionsPage() }, "设置")),
  ),
  h("div", { class: "at-popup__langs" },
    fromSelect,
    h("button", {
      class: "at-btn at-btn--ghost",
      title: "交换语言",
      onclick: () => {
        const from = fromSelect.value;
        fromSelect.value = toSelect.value;
        toSelect.value = from === "auto" ? config.settings.fallbackSourceLanguage : from;
      },
    }, "⇄"),
    toSelect,
  ),
  inputArea,
  h("div", { class: "at-popup__actions" },
    translateButton,
    copyButton,
    h("span", { class: "at-popup__spacer" }),
    h("button", {
      class: "at-btn at-btn--ghost",
      onclick: () => {
        inputArea.value = "";
        resultArea.textContent = "翻译结果会显示在这里。";
        resultArea.classList.add("at-popup__result--placeholder");
        metaLine.textContent = "";
        detectionLine.textContent = "";
        lastText = "";
        setError(null);
      },
    }, "清空"),
  ),
  resultArea,
  h("div", { class: "at-popup__meta" }, detectionLine, metaLine),
  errorLine,
  h("p", { class: "at-popup__hint" },
    "在网页中选中文字后点击浮动「译」按钮，或使用快捷键 Alt+Shift+T 直接翻译，无需打开本窗口。"),
);

document.querySelector("#app")?.replaceWith(app);
setError(null);

void (async () => {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.id === undefined) return;
    const [injection] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => window.getSelection()?.toString() ?? "",
    });
    const selection = typeof injection?.result === "string" ? injection.result.trim() : "";
    if (selection) {
      inputArea.value = selection;
      await translate();
    }
  } catch {
    // Reading the selection is best-effort; some pages disallow script injection.
  }
})();
