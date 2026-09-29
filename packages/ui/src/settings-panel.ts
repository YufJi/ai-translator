import {
  DEFAULT_SETTINGS,
  PROVIDER_PRESETS,
  TONES,
  createProvider,
  defaultConfig,
  exportConfigJson,
  getPreset,
  mergeSettings,
  parseConfig,
  providerConfigFromPreset,
  testProvider,
  validateConfig,
  type AppConfig,
  type ConfigStore,
  type ProviderConfig,
  type Tone,
} from "./deps.ts";
import { append, clear, h } from "./dom.ts";
import { formatGlossaryText, fillLanguageSelect, parseGlossaryText, errorMessage } from "./format.ts";

export interface SettingsPanelOptions {
  store: ConfigStore;
  fetchImpl?: typeof fetch;
  onConfigChange?: (config: AppConfig) => void;
  onClose?: () => void;
}

export interface SettingsPanel {
  element: HTMLElement;
  open(): void;
  close(): void;
  isOpen(): boolean;
  refresh(): void;
}

type Tab = "providers" | "translation" | "data";

const TONE_LABELS: Record<Tone, string> = {
  neutral: "中性（默认）",
  formal: "正式书面",
  informal: "口语随意",
  technical: "技术文档",
  marketing: "营销文案",
  academic: "学术论文",
  literal: "直译",
};

export function createSettingsPanel(options: SettingsPanelOptions): SettingsPanel {
  let tab: Tab = "providers";
  let editing: ProviderConfig | null = null;
  let editingModels: string[] = [];
  let presetChoice = "mock";
  let status = "";
  let statusIsError = false;

  const panel = h("section", { class: "at-panel", "aria-hidden": "true" });
  const body = h("div", { class: "at-panel__body" });
  const statusBar = h("p", { class: "at-status" });

  const setStatus = (message: string, isError = false): void => {
    status = message;
    statusIsError = isError;
    statusBar.textContent = message;
    statusBar.classList.toggle("at-status--error", isError);
  };

  const currentConfig = (): AppConfig => options.store.load();

  const persist = (next: AppConfig): boolean => {
    const result = validateConfig(next);
    if (!result.ok) {
      setStatus(result.errors.join("；"), true);
      return false;
    }
    options.store.save(result.config);
    options.onConfigChange?.(result.config);
    setStatus(result.warnings.join("；"));
    return true;
  };

  const saveProvider = (provider: ProviderConfig): boolean => {
    const config = currentConfig();
    const exists = config.providers.some((entry) => entry.id === provider.id);
    const providers = exists
      ? config.providers.map((entry) => (entry.id === provider.id ? provider : entry))
      : [...config.providers, provider];
    return persist({
      ...config,
      providers,
      activeProviderId: config.activeProviderId ?? provider.id,
    });
  };

  const deleteProvider = (id: string): boolean => {
    const config = currentConfig();
    const providers = config.providers.filter((entry) => entry.id !== id);
    return persist({
      ...config,
      providers,
      activeProviderId: config.activeProviderId === id ? (providers[0]?.id ?? null) : config.activeProviderId,
    });
  };

  function providerSection(): HTMLElement {
    const config = currentConfig();
    const list = h("div", { class: "at-providers" });
    for (const provider of config.providers) {
      const active = provider.id === config.activeProviderId;
      list.appendChild(
        h(
          "div",
          { class: `at-provider${active ? " at-provider--active" : ""}` },
          h("label", { class: "at-provider__main" },
            h("input", {
              type: "radio",
              name: "at-active-provider",
              checked: active,
              onchange: () => persist({ ...config, activeProviderId: provider.id }) && render(),
            }),
            h("span", { class: "at-provider__text" },
              h("strong", {}, provider.label ?? provider.id),
              h("small", {}, `${provider.kind} · ${provider.model || "未设置模型"}${provider.apiKey ? "" : " · 无密钥"}`),
            ),
          ),
          h("div", { class: "at-provider__actions" },
            h("button", {
              type: "button",
              class: "at-btn at-btn--ghost",
              onclick: () => {
                editing = { ...provider };
                editingModels = getPreset(provider.presetId)?.models ?? [];
                render();
              },
            }, "编辑"),
            h("button", {
              type: "button",
              class: "at-btn at-btn--ghost",
              onclick: async (event: Event) => {
                const button = event.currentTarget as HTMLButtonElement;
                button.disabled = true;
                setStatus("正在测试连接…");
                const health = await testProvider(provider, options.fetchImpl ? { fetchImpl: options.fetchImpl } : {});
                button.disabled = false;
                setStatus(
                  health.ok
                    ? `连接正常 · ${health.latencyMs}ms · ${health.models?.length ?? 0} 个模型`
                    : `连接失败：${health.error}`,
                  !health.ok,
                );
              },
            }, "测试"),
            h("button", {
              type: "button",
              class: "at-btn at-btn--danger",
              onclick: () => deleteProvider(provider.id) && render(),
            }, "删除"),
          ),
        ),
      );
    }

    const addRow = h("div", { class: "at-row" },
      h("select", {
        class: "at-select",
        id: "at-preset-select",
      }, ...PROVIDER_PRESETS.map((preset) =>
        h("option", { value: preset.id, selected: preset.id === presetChoice }, `${preset.label}（${preset.kind}）`))),
      h("button", {
        type: "button",
        class: "at-btn",
        onclick: () => {
          const select = panel.querySelector<HTMLSelectElement>("#at-preset-select");
          if (!select) return;
          presetChoice = select.value;
          const config2 = currentConfig();
          editing = providerConfigFromPreset(select.value, config2.providers);
          editingModels = getPreset(select.value)?.models ?? [];
          render();
        },
      }, "添加模型服务"),
    );

    const children: HTMLElement[] = [
      h("h3", {}, "模型服务"),
      h("p", { class: "at-hint" }, "支持任意 OpenAI 兼容接口（OpenAI / DeepSeek / Kimi / 通义 / 智谱 / Ollama / One-API…）以及 Anthropic、Gemini。"),
      list,
      addRow,
    ];
    if (editing) children.push(providerEditor());
    return h("div", { class: "at-section" }, ...children);
  }

  function providerEditor(): HTMLElement {
    const provider = editing!;
    const preset = getPreset(provider.presetId);
    const field = (label: string, input: HTMLElement, hint?: string): HTMLElement =>
      h("label", { class: "at-field" },
        h("span", { class: "at-field__label" }, label),
        input,
        hint ? h("small", { class: "at-field__hint" }, hint) : null,
      );

    const baseUrl = h("input", { class: "at-input", type: "text", value: provider.baseUrl ?? "", placeholder: preset?.baseUrl ?? "https://api.openai.com/v1" });
    const apiKey = h("input", { class: "at-input", type: "password", value: provider.apiKey ?? "", placeholder: preset?.requiresApiKey === false ? "本地服务可留空" : "sk-..." });
    const model = h("input", { class: "at-input", type: "text", value: provider.model, placeholder: preset?.defaultModel ?? "model-name" });
    const path = h("input", { class: "at-input", type: "text", value: provider.path ?? "", placeholder: "/chat/completions" });
    const label = h("input", { class: "at-input", type: "text", value: provider.label ?? "", placeholder: preset?.label ?? provider.id });
    const streamUsage = h("input", { type: "checkbox", checked: provider.streamUsage === true });

    const modelList = h("datalist", { id: "at-model-list" }, ...editingModels.map((id) => h("option", { value: id })));
    model.setAttribute("list", "at-model-list");

    const readEditor = (): ProviderConfig => ({
      ...provider,
      label: label.value.trim() || provider.label,
      baseUrl: baseUrl.value.trim() || undefined,
      apiKey: apiKey.value.trim() || undefined,
      model: model.value.trim(),
      path: path.value.trim() || undefined,
      streamUsage: streamUsage.checked,
    });

    return h("div", { class: "at-editor" },
      h("h4", {}, `${provider.label ?? provider.id} 配置`),
      field("显示名称", label),
      field("接口地址 baseUrl", baseUrl),
      field("API Key", apiKey, "仅保存在本机浏览器存储中，不会上传。"),
      field("模型", model),
      modelList,
      field("请求路径 path", path, "Azure 等需要自定义路径时填写。"),
      h("label", { class: "at-check" }, streamUsage, h("span", {}, "请求流式 usage（部分服务需要开启）")),
      h("div", { class: "at-row" },
        h("button", {
          type: "button",
          class: "at-btn",
          onclick: () => saveProvider(readEditor()) && (editing = null, render()),
        }, "保存"),
        h("button", {
          type: "button",
          class: "at-btn at-btn--ghost",
          onclick: async (event: Event) => {
            const button = event.currentTarget as HTMLButtonElement;
            button.disabled = true;
            setStatus("正在拉取模型列表…");
            try {
              const models = await createProvider(readEditor(), options.fetchImpl ? { fetchImpl: options.fetchImpl } : {}).listModels();
              editingModels = models;
              setStatus(`获取到 ${models.length} 个模型`);
              if (models[0] && !model.value.trim()) model.value = models[0];
              render();
            } catch (error) {
              setStatus(`获取模型失败：${errorMessage(error)}`, true);
              button.disabled = false;
            }
          },
        }, "获取模型"),
        h("button", {
          type: "button",
          class: "at-btn at-btn--ghost",
          onclick: () => {
            editing = null;
            render();
          },
        }, "取消"),
      ),
    );
  }

  function translationSection(): HTMLElement {
    const config = currentConfig();
    const settings = config.settings;
    const source = h("select", { class: "at-select" });
    fillLanguageSelect(source, { includeAuto: true, selected: settings.autoDetect ? "auto" : settings.sourceLanguage });
    const target = h("select", { class: "at-select" });
    fillLanguageSelect(target, { includeAuto: false, selected: settings.targetLanguage });
    const fallback = h("select", { class: "at-select" });
    fillLanguageSelect(fallback, { includeAuto: false, selected: settings.fallbackSourceLanguage });
    const tone = h("select", { class: "at-select" },
      ...TONES.map((value) => h("option", { value, selected: value === settings.tone }, TONE_LABELS[value])));
    const strategy = h("select", { class: "at-select" },
      ...([["hybrid", "混合（推荐）"], ["heuristic", "仅本地规则"], ["llm", "总是询问模型"]] as const).map(
        ([value, text]) => h("option", { value, selected: value === settings.detectStrategy }, text),
      ));
    const domain = h("input", { class: "at-input", type: "text", value: settings.domain ?? "", placeholder: "例如：法律合同、医学论文" });
    const audience = h("input", { class: "at-input", type: "text", value: settings.audience ?? "", placeholder: "例如：普通消费者" });
    const glossary = h("textarea", { class: "at-textarea", rows: 5, placeholder: "cluster = 集群\nprompt = 提示词" }, formatGlossaryText(settings.glossary));
    const chunkSize = h("input", { class: "at-input", type: "number", min: "200", max: "200000", step: "100", value: settings.chunkSize });
    const temperature = h("input", { class: "at-input", type: "number", min: "0", max: "2", step: "0.1", value: settings.temperature });
    const preserve = h("input", { type: "checkbox", checked: settings.preserveFormatting });
    const cascade = h("input", { type: "checkbox", checked: settings.skipSameLanguage });
    const cacheOn = h("input", { type: "checkbox", checked: settings.cache.enabled });
    const batchMode = h("select", { class: "at-select" },
      ...([["segment", "逐段请求（更稳）"], ["json", "JSON 批量（更快）"]] as const).map(
        ([value, text]) => h("option", { value, selected: value === settings.batchMode }, text),
      ));

    return h("div", { class: "at-section" },
      h("h3", {}, "翻译设置"),
      h("div", { class: "at-grid" },
        h("label", { class: "at-field" }, h("span", { class: "at-field__label" }, "默认源语言"), source),
        h("label", { class: "at-field" }, h("span", { class: "at-field__label" }, "默认目标语言"), target),
        h("label", { class: "at-field" }, h("span", { class: "at-field__label" }, "识别失败时回退"), fallback),
        h("label", { class: "at-field" }, h("span", { class: "at-field__label" }, "语气风格"), tone),
        h("label", { class: "at-field" }, h("span", { class: "at-field__label" }, "自动识别策略"), strategy),
        h("label", { class: "at-field" }, h("span", { class: "at-field__label" }, "批量方式"), batchMode),
        h("label", { class: "at-field" }, h("span", { class: "at-field__label" }, "领域"), domain),
        h("label", { class: "at-field" }, h("span", { class: "at-field__label" }, "目标读者"), audience),
        h("label", { class: "at-field" }, h("span", { class: "at-field__label" }, "分段长度（字符）"), chunkSize),
        h("label", { class: "at-field" }, h("span", { class: "at-field__label" }, "temperature"), temperature),
      ),
      h("label", { class: "at-field" }, h("span", { class: "at-field__label" }, "术语表（每行 原文 = 译文）"), glossary),
      h("div", { class: "at-checks" },
        h("label", { class: "at-check" }, preserve, h("span", {}, "保留 Markdown 与换行格式")),
        h("label", { class: "at-check" }, cascade, h("span", {}, "源语言与目标语言相同时跳过翻译")),
        h("label", { class: "at-check" }, cacheOn, h("span", {}, "启用译文缓存")),
      ),
      h("div", { class: "at-row" },
        h("button", {
          type: "button",
          class: "at-btn",
          onclick: () => {
            const next = mergeSettings(settings, {
              autoDetect: source.value === "auto",
              sourceLanguage: source.value === "auto" ? "auto" : source.value,
              targetLanguage: target.value,
              fallbackSourceLanguage: fallback.value,
              tone: tone.value as Tone,
              detectStrategy: strategy.value as typeof settings.detectStrategy,
              batchMode: batchMode.value as typeof settings.batchMode,
              domain: domain.value.trim(),
              audience: audience.value.trim(),
              glossary: parseGlossaryText(glossary.value),
              chunkSize: Number(chunkSize.value),
              temperature: Number(temperature.value),
              preserveFormatting: preserve.checked,
              skipSameLanguage: cascade.checked,
              cache: { ...settings.cache, enabled: cacheOn.checked },
            });
            persist({ ...currentConfig(), settings: next }) && render();
          },
        }, "保存设置"),
        h("button", {
          type: "button",
          class: "at-btn at-btn--ghost",
          onclick: () => persist({ ...currentConfig(), settings: structuredClone(DEFAULT_SETTINGS) }) && render(),
        }, "恢复翻译默认值"),
      ),
    );
  }

  function dataSection(): HTMLElement {
    const textarea = h("textarea", { class: "at-textarea", rows: 10, spellcheck: "false" });
    textarea.value = exportConfigJson(currentConfig(), { includeSecrets: false });
    return h("div", { class: "at-section" },
      h("h3", {}, "配置导入导出"),
      h("p", { class: "at-hint" }, "导出的 JSON 已隐藏 API Key，可直接分享；导入时会自动校验并补全默认值。"),
      textarea,
      h("div", { class: "at-row" },
        h("button", {
          type: "button",
          class: "at-btn",
          onclick: () => {
            const result = parseConfig(textarea.value);
            if (!result.ok) return setStatus(result.errors.join("；"), true);
            persist(result.config) && render();
          },
        }, "导入这段配置"),
        h("button", {
          type: "button",
          class: "at-btn at-btn--ghost",
          onclick: async () => {
            const text = exportConfigJson(currentConfig(), { includeSecrets: false });
            textarea.value = text;
            if (await copyTextSafe(text)) setStatus("已复制到剪贴板");
          },
        }, "复制导出内容"),
        h("button", {
          type: "button",
          class: "at-btn at-btn--danger",
          onclick: () => persist(defaultConfig()) && render(),
        }, "重置全部配置"),
      ),
    );
  }

  async function copyTextSafe(text: string): Promise<boolean> {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      return false;
    }
  }

  function render(): void {
    const config = currentConfig();
    clear(panel);
    const tabs: [Tab, string][] = [
      ["providers", "模型服务"],
      ["translation", "翻译"],
      ["data", "导入导出"],
    ];
    append(panel, [
      h("header", { class: "at-panel__head" },
        h("div", {},
          h("h2", {}, "AI 翻译设置"),
          h("p", { class: "at-hint" }, `当前：${config.activeProviderId ?? "未选择"} · 目标语言 ${config.settings.targetLanguage}`),
        ),
        h("button", { type: "button", class: "at-btn at-btn--ghost", onclick: () => close() }, "关闭"),
      ),
      h("nav", { class: "at-tabs" },
        ...tabs.map(([value, text]) =>
          h("button", {
            type: "button",
            class: `at-tab${tab === value ? " at-tab--active" : ""}`,
            onclick: () => {
              tab = value;
              render();
            },
          }, text)),
      ),
      body,
      statusBar,
    ]);
    clear(body);
    if (tab === "providers") body.appendChild(providerSection());
    else if (tab === "translation") body.appendChild(translationSection());
    else body.appendChild(dataSection());
    statusBar.textContent = status;
    statusBar.classList.toggle("at-status--error", statusIsError);
  }

  function open(): void {
    render();
    panel.classList.add("at-panel--open");
    panel.setAttribute("aria-hidden", "false");
  }

  function close(): void {
    editing = null;
    panel.classList.remove("at-panel--open");
    panel.setAttribute("aria-hidden", "true");
    options.onClose?.();
  }

  return {
    element: panel,
    open,
    close,
    isOpen: () => panel.classList.contains("at-panel--open"),
    refresh: render,
  };
}
