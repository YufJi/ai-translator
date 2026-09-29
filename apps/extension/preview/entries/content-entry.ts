import { defaultConfig } from "../../../../packages/core/src/index.ts";
import { CONFIG_STORAGE_KEY } from "../../src/messages.ts";
import {
  fireInstalled,
  installChromeStub,
  setPreviewRole,
  setPreviewSelection,
  triggerCommand,
  triggerContextMenu,
} from "../chrome-stub.ts";
import { h } from "../../../../packages/ui/src/dom.ts";

installChromeStub({ [CONFIG_STORAGE_KEY]: defaultConfig() });
setPreviewSelection("Shortcuts are the fastest way to translate a sentence.");

setPreviewRole("background");
await import("../../src/background.ts");
fireInstalled();

setPreviewRole("content");
await import("../../src/content.ts");

const simulate = (label: string, run: () => void): HTMLElement =>
  h("button", { class: "at-btn at-btn--ghost", type: "button", onclick: run }, label);

const toolbar = h("div", { class: "at-preview__banner" },
  h("strong", {}, "预览控制台"),
  h("span", {}, "在正文中拖选文字可触发浮动「译」按钮；也可以直接模拟扩展的另外两条入口："),
  simulate("模拟右键菜单翻译", () =>
    triggerContextMenu("The quick brown fox jumps over the lazy dog.")),
  simulate("模拟 Alt+Shift+T 快捷键", () => triggerCommand("translate-selection")),
  h("span", { class: "at-preview__hint" }, "（此处 chrome.* 由本地桩实现填充，翻译走离线演示 Provider）"),
);

document.body.prepend(toolbar);
document.body.dataset.ready = "true";
