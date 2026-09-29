import { createSettingsPanel, h } from "../../../packages/ui/src/index.ts";
import { getConfigStore } from "./store.ts";

const store = await getConfigStore();
const panel = createSettingsPanel({ store });
panel.open();

const view = h("div", {},
  h("div", { class: "at-options__intro" },
    h("h1", {}, "AI 翻译 · 模型与翻译设置"),
    h("p", {}, "配置保存在浏览器本地存储（chrome.storage.local）中，API Key 不会上传到任何第三方服务。"),
  ),
  panel.element,
);

document.querySelector("#app")?.replaceWith(view);
