/// <reference types="chrome" />

import { SettingsPanel } from "@ai-translator/ui";
import "@ai-translator/ui/styles.css";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./options.css";
import { getConfigStore } from "./store.ts";

const store = await getConfigStore();

export function OptionsApp() {
  return (
    <>
      <div className="at-options__intro">
        <h1>AI 翻译 · 模型与翻译设置</h1>
        <p>配置保存在浏览器本地存储（chrome.storage.local）中，API Key 不会上传到任何第三方服务。</p>
      </div>
      <SettingsPanel store={store} open />
    </>
  );
}

const container = document.getElementById("app");
if (container) {
  createRoot(container).render(
    <StrictMode>
      <OptionsApp />
    </StrictMode>,
  );
}
