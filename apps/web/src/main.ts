import {
  Translator,
  createLocalConfigStore,
  resolveActiveProvider,
  textStats,
  type AppConfig,
  type TranslationResult,
} from "../../../packages/core/src/index.ts";
import {
  activeProviderLabel,
  copyText,
  createSettingsPanel,
  detectionBadge,
  errorMessage,
  fillLanguageSelect,
  h,
  resultMeta,
} from "../../../packages/ui/src/index.ts";

const store = createLocalConfigStore();
let config: AppConfig = store.load();
let controller: AbortController | null = null;
let busy = false;
let autoTimer: ReturnType<typeof setTimeout> | undefined;
let lastResult: TranslationResult | null = null;

const providerBadge = h("span", { class: "at-badge" });
const fromSelect = h("select", { class: "at-select", title: "源语言" });
const toSelect = h("select", { class: "at-select", title: "目标语言" });
const autoToggle = h("input", { type: "checkbox", id: "at-auto" });
const streamToggle = h("input", { type: "checkbox", checked: true, id: "at-stream" });
const inputArea = h("textarea", {
  class: "at-input-area",
  placeholder: "输入或粘贴要翻译的内容…",
  spellcheck: "false",
}) as HTMLTextAreaElement;
const outputArea = h("div", { class: "at-output at-output--placeholder" }, "翻译结果会显示在这里。");
const detectionLine = h("span", { class: "at-badge at-badge--muted" });
const inputStats = h("span", {});
const outputStats = h("span", {});
const errorBox = h("div", { class: "at-error at-hidden" });
const translateButton = h("button", { class: "at-btn", onclick: () => void run() }, "翻译");
const copyButton = h("button", { class: "at-btn at-btn--ghost", onclick: () => void copyOutput() }, "复制译文");

const translator = new Translator({ config });

const settingsPanel = createSettingsPanel({
  store,
  onConfigChange: (next) => {
    config = next;
    translator.setConfig(next);
    syncFromConfig();
  },
});

function syncFromConfig(): void {
  const from = fromSelect.value || (config.settings.autoDetect ? "auto" : config.settings.sourceLanguage);
  const to = toSelect.value || config.settings.targetLanguage;
  fillLanguageSelect(fromSelect, { includeAuto: true, selected: from });
  fillLanguageSelect(toSelect, { includeAuto: false, selected: to });
  providerBadge.textContent = activeProviderLabel(config);
  const enabled = resolveActiveProvider(config) !== undefined;
  translateButton.disabled = !enabled || busy;
  copyButton.disabled = lastResult === null;
}

function showError(message: string | null): void {
  errorBox.textContent = message ?? "";
  errorBox.classList.toggle("at-hidden", message === null);
}

function setBusy(value: boolean): void {
  busy = value;
  translateButton.textContent = value ? "翻译中…" : "翻译";
  translateButton.disabled = value || resolveActiveProvider(config) === undefined;
  outputArea.classList.toggle("at-output--streaming", value);
}

function writeOutput(text: string, placeholder = false): void {
  outputArea.textContent = text;
  outputArea.classList.toggle("at-output--placeholder", placeholder);
}

function updateStats(): void {
  const value = inputArea.value;
  if (value.trim().length === 0) {
    inputStats.textContent = "";
    return;
  }
  const stats = textStats(value);
  inputStats.textContent = `${stats.characters} 字符 · ${stats.words} 词/字 · ${stats.lines} 行`;
}

async function copyOutput(): Promise<void> {
  if (!lastResult) return;
  const ok = await copyText(outputArea.textContent ?? "");
  showError(ok ? null : "复制失败，请手动选择文本。");
}

function translateOptions() {
  return {
    from: fromSelect.value as "auto" | string,
    to: toSelect.value,
    ...(controller ? { signal: controller.signal } : {}),
  };
}

function presentResult(result: TranslationResult): void {
  lastResult = result;
  detectionLine.textContent = detectionBadge(result);
  detectionLine.classList.remove("at-hidden");
  outputStats.textContent = resultMeta(result);
  const notes = result.warnings.length > 0 ? ` · ${result.warnings.join("；")}` : "";
  if (result.skipped) {
    outputStats.textContent = `源语言与目标语言相同，已跳过翻译${notes}`;
  } else if (notes) {
    outputStats.textContent = `${resultMeta(result)}${notes}`;
  }
  copyButton.disabled = false;
}

async function run(): Promise<void> {
  const text = inputArea.value;
  if (text.trim().length === 0) {
    showError("请先输入需要翻译的内容。");
    return;
  }
  if (resolveActiveProvider(config) === undefined) {
    showError("还没有可用的模型服务，请先在设置里添加一个。");
    settingsPanel.open();
    return;
  }
  controller?.abort();
  controller = new AbortController();
  showError(null);
  setBusy(true);
  writeOutput("", true);
  const options = translateOptions();
  const useStream = streamToggle.checked;

  try {
    if (!useStream) {
      const result = await translator.translate(text, options);
      writeOutput(result.text);
      presentResult(result);
      return;
    }
    let streamed = "";
    let done: TranslationResult | null = null;
    try {
      for await (const event of translator.streamTranslate(text, options)) {
        if (event.type === "delta") {
          streamed += event.text;
          writeOutput(streamed);
        } else if (event.type === "done") {
          done = event.result;
        } else if (event.type === "detected") {
          detectionLine.textContent = `识别中：${event.result.language}`;
          detectionLine.classList.remove("at-hidden");
        }
      }
    } catch (error) {
      if (streamed.length > 0) throw error;
      const result = await translator.translate(text, options);
      writeOutput(result.text);
      presentResult(result);
      return;
    }
    if (done) {
      writeOutput(done.text);
      presentResult(done);
    }
  } catch (error) {
    if ((error as { name?: string }).name === "AbortError") return;
    showError(errorMessage(error));
    if (!outputArea.textContent) writeOutput("翻译失败，请检查模型服务配置。", true);
  } finally {
    setBusy(false);
    controller = null;
  }
}

function swapLanguages(): void {
  const detected = lastResult?.source.language;
  const from = fromSelect.value === "auto" ? (detected ?? config.settings.fallbackSourceLanguage) : fromSelect.value;
  const to = toSelect.value;
  fillLanguageSelect(fromSelect, { includeAuto: true, selected: to });
  fillLanguageSelect(toSelect, { includeAuto: false, selected: from });
  if (lastResult && inputArea.value.trim() === lastResult.text.trim()) {
    inputArea.value = lastResult.text;
    writeOutput("");
  }
  updateStats();
}

const app = h("main", { class: "at-app" },
  h("header", { class: "at-app__head" },
    h("div", {},
      h("h1", { class: "at-app__title" }, "AI 翻译工作台"),
      h("p", { class: "at-app__subtitle" }, "接入你自己的大模型服务，自动识别语言后翻译，支持流式输出与术语约束。"),
    ),
    h("div", { class: "at-app__head-actions" },
      providerBadge,
      h("button", { class: "at-btn at-btn--ghost", onclick: () => settingsPanel.open() }, "设置"),
    ),
  ),
  h("section", { class: "at-langbar" },
    fromSelect,
    h("button", {
      class: "at-btn at-btn--ghost",
      title: "交换语言",
      onclick: swapLanguages,
    }, "⇄"),
    toSelect,
    h("span", { class: "at-langbar__arrow" }, "→"),
    h("label", { class: "at-check", for: "at-auto" }, autoToggle, h("span", {}, "输入后自动翻译")),
    h("label", { class: "at-check", for: "at-stream" }, streamToggle, h("span", {}, "流式输出")),
    h("span", { class: "at-langbar__spacer" }),
    h("span", { class: "at-meta" }, inputStats),
  ),
  errorBox,
  h("section", { class: "at-columns" },
    h("div", { class: "at-card" },
      h("div", { class: "at-card__head" },
        h("span", {}, "原文"),
        h("div", { class: "at-toolbar" },
          h("button", {
            class: "at-btn at-btn--ghost",
            onclick: async () => {
              try {
                inputArea.value = await navigator.clipboard.readText();
                updateStats();
              } catch {
                showError("无法读取剪贴板，请手动粘贴。");
              }
            },
          }, "粘贴"),
          h("button", {
            class: "at-btn at-btn--ghost",
            onclick: () => {
              inputArea.value = "";
              writeOutput("翻译结果会显示在这里。", true);
              updateStats();
              detectionLine.textContent = "";
              outputStats.textContent = "";
              lastResult = null;
              copyButton.disabled = true;
            },
          }, "清空"),
        ),
      ),
      h("div", { class: "at-card__body" }, inputArea),
      h("div", { class: "at-card__foot" },
        h("span", {}, "⌘/Ctrl + Enter 翻译"),
        h("div", { class: "at-toolbar" }, translateButton),
      ),
    ),
    h("div", { class: "at-card" },
      h("div", { class: "at-card__head" },
        h("span", {}, "译文"),
        h("div", { class: "at-toolbar" }, copyButton),
      ),
      h("div", { class: "at-card__body" }, outputArea),
      h("div", { class: "at-card__foot" },
        h("div", { class: "at-meta" }, detectionLine),
        h("span", { class: "at-meta" }, outputStats),
      ),
    ),
  ),
  h("footer", { class: "at-footer-links" },
    h("span", {}, `${config.providers.length} 个模型服务已配置`),
    h("span", {}, "配置仅保存在本机浏览器存储，API Key 不会上传到任何第三方服务。"),
  ),
  settingsPanel.element,
);

document.querySelector("#app")?.replaceWith(app);
detectionLine.classList.add("at-hidden");
syncFromConfig();
updateStats();

inputArea.addEventListener("input", () => {
  updateStats();
  if (!autoToggle.checked) return;
  clearTimeout(autoTimer);
  autoTimer = setTimeout(() => {
    if (!busy && inputArea.value.trim().length > 0) void run();
  }, 900);
});

document.addEventListener("keydown", (event) => {
  if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
    event.preventDefault();
    void run();
  }
});
