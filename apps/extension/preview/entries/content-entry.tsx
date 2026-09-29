import { defaultConfig } from "@ai-translator/core";
import "@ai-translator/ui/styles.css";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { CONFIG_STORAGE_KEY } from "../../src/messages.ts";
import {
  fireInstalled,
  installChromeStub,
  setPreviewRole,
  setPreviewSelection,
  setPreviewStaleContext,
  triggerCommand,
  triggerContextMenu,
} from "../chrome-stub.ts";
import "../preview.css";

setPreviewStaleContext(new URLSearchParams(location.search).has("stale"));
installChromeStub({ [CONFIG_STORAGE_KEY]: defaultConfig() });
setPreviewSelection("Shortcuts are the fastest way to translate a sentence.");

setPreviewRole("background");
await import("../../src/background.ts");
fireInstalled();

setPreviewRole("content");
await import("../../src/content.tsx");

function Toolbar() {
  return (
    <div className="at-preview__banner">
      <strong>预览控制台</strong>
      <span>在正文中拖选文字可触发浮动「译」按钮；也可以直接模拟扩展的另外两条入口：</span>
      <button
        type="button"
        className="at-btn at-btn--ghost"
        onClick={() => triggerContextMenu("The quick brown fox jumps over the lazy dog.")}
      >
        模拟右键菜单翻译
      </button>
      <button
        type="button"
        className="at-btn at-btn--ghost"
        onClick={() => triggerCommand("translate-selection")}
      >
        模拟 Alt+Shift+T 快捷键
      </button>
      <span className="at-preview__hint">（此处 chrome.* 由本地桩实现填充，翻译走离线演示 Provider）</span>
    </div>
  );
}

const toolbarHost = document.createElement("div");
// `?bare` hides the preview chrome, which is what doc screenshots want.
if (!new URLSearchParams(location.search).has("bare")) {
  document.body.prepend(toolbarHost);
  createRoot(toolbarHost).render(
    <StrictMode>
      <Toolbar />
    </StrictMode>,
  );
}
