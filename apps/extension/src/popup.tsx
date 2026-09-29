/// <reference types="chrome" />

import {
  activeProviderLabel,
  copyText,
  errorMessage,
  LanguageSelect,
  useConfig,
} from "@ai-translator/ui";
import "@ai-translator/ui/styles.css";
import { StrictMode, useCallback, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import "./popup.css";
import type { ExtensionRequest, ExtensionResponse, TranslationPayload } from "./messages.ts";
import { getConfigStore } from "./store.ts";

const store = await getConfigStore();

function sendRequest(request: ExtensionRequest): Promise<ExtensionResponse> {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(request, (response: ExtensionResponse | undefined) => {
      if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
      else if (!response) reject(new Error("扩展后台未响应"));
      else resolve(response);
    });
  });
}

export function PopupApp() {
  const config = useConfig(store);
  const [from, setFrom] = useState(config.settings.autoDetect ? "auto" : config.settings.sourceLanguage);
  const [to, setTo] = useState(config.settings.targetLanguage);
  const [input, setInput] = useState("");
  const [payload, setPayload] = useState<TranslationPayload | null>(null);
  const [output, setOutput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const translate = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed) {
        setError("请先输入内容。");
        return;
      }
      setError(null);
      setBusy(true);
      setOutput("正在翻译…");
      try {
        const response = await sendRequest({ type: "at:translate", text: trimmed, from, to });
        if (!response.ok) {
          setError(response.error);
          setOutput("翻译失败。");
          return;
        }
        setPayload(response.payload);
        setOutput(response.payload.translated);
      } catch (cause) {
        setError(errorMessage(cause));
        setOutput("翻译失败。");
      } finally {
        setBusy(false);
      }
    },
    [from, to],
  );

  useEffect(() => {
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
          setInput(selection);
          await translate(selection);
        }
      } catch {
        // Reading the selection is best-effort; some pages disallow script injection.
      }
    })();
    // Runs once on mount: the popup translates the page selection on open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <section>
      <header className="at-popup__head">
        <h1 className="at-popup__title">AI 翻译</h1>
        <div className="at-row">
          <span className="at-badge">{activeProviderLabel(config)}</span>
          <button type="button" className="at-btn at-btn--ghost" onClick={() => chrome.runtime.openOptionsPage()}>
            设置
          </button>
        </div>
      </header>

      <div className="at-popup__langs">
        <LanguageSelect className="at-select" includeAuto value={from} onChange={setFrom} />
        <button
          type="button"
          className="at-btn at-btn--ghost"
          title="交换语言"
          onClick={() => {
            setFrom(to);
            setTo(from === "auto" ? config.settings.fallbackSourceLanguage : from);
          }}
        >
          ⇄
        </button>
        <LanguageSelect className="at-select" value={to} onChange={setTo} />
      </div>

      <textarea
        placeholder="输入要翻译的内容…"
        spellCheck={false}
        value={input}
        onChange={(event) => setInput(event.target.value)}
      />

      <div className="at-popup__actions">
        <button type="button" className="at-btn" disabled={busy} onClick={() => void translate(input)}>
          {busy ? "翻译中…" : "翻译"}
        </button>
        <button
          type="button"
          className="at-btn at-btn--ghost"
          disabled={!output || busy}
          onClick={async () => {
            const ok = await copyText(output);
            setError(ok ? null : "复制失败，请手动选择文本。");
          }}
        >
          复制
        </button>
        <span className="at-popup__spacer" />
        <button
          type="button"
          className="at-btn at-btn--ghost"
          onClick={() => {
            setInput("");
            setOutput("");
            setPayload(null);
            setError(null);
          }}
        >
          清空
        </button>
      </div>

      <div className={`at-popup__result${output ? "" : " at-popup__result--placeholder"}`}>
        {output || "翻译结果会显示在这里。"}
      </div>

      <div className="at-popup__meta">
        <span>{payload ? `${payload.source} → ${payload.target}` : ""}</span>
        <span>{payload?.meta ?? ""}</span>
      </div>

      {error ? <p className="at-popup__error">{error}</p> : null}

      <p className="at-popup__hint">
        在网页中选中文字后点击浮动「译」按钮，或使用快捷键 Alt+Shift+T 直接翻译，无需打开本窗口。
      </p>
    </section>
  );
}

const container = document.getElementById("app");
if (container) {
  createRoot(container).render(
    <StrictMode>
      <PopupApp />
    </StrictMode>,
  );
}
