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
  type TranslationSettings,
} from "@ai-translator/core";
import { useEffect, useState, type ReactNode } from "react";
import { formatGlossaryText, parseGlossaryText, errorMessage } from "../format.ts";
import { LanguageSelect } from "./LanguageSelect.tsx";
import { useConfig } from "./hooks.ts";

export interface SettingsPanelProps {
  store: ConfigStore;
  fetchImpl?: typeof fetch;
  open?: boolean;
  onClose?: () => void;
}

type Tab = "providers" | "translation" | "data";

const TAB_LABELS: [Tab, string][] = [
  ["providers", "模型服务"],
  ["translation", "翻译"],
  ["data", "导入导出"],
];

const TONE_LABELS: Record<Tone, string> = {
  neutral: "中性（默认）",
  formal: "正式书面",
  informal: "口语随意",
  technical: "技术文档",
  marketing: "营销文案",
  academic: "学术论文",
  literal: "直译",
};

interface Status {
  text: string;
  error: boolean;
}

export function SettingsPanel({ store, fetchImpl, open = false, onClose }: SettingsPanelProps) {
  const config = useConfig(store);
  const [tab, setTab] = useState<Tab>("providers");
  const [editing, setEditing] = useState<ProviderConfig | null>(null);
  const [models, setModels] = useState<string[]>([]);
  const [presetChoice, setPresetChoice] = useState("mock");
  const [status, setStatus] = useState<Status>({ text: "", error: false });

  const deps = fetchImpl ? { fetchImpl } : {};

  const persist = (next: AppConfig): boolean => {
    const result = validateConfig(next);
    if (!result.ok) {
      setStatus({ text: result.errors.join("；"), error: true });
      return false;
    }
    store.save(result.config);
    setStatus({ text: result.warnings.join("；"), error: false });
    return true;
  };

  const saveProvider = (provider: ProviderConfig): boolean => {
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

  const deleteProvider = (id: string): void => {
    const providers = config.providers.filter((entry) => entry.id !== id);
    persist({
      ...config,
      providers,
      activeProviderId: config.activeProviderId === id ? (providers[0]?.id ?? null) : config.activeProviderId,
    });
  };

  const addProvider = (): void => {
    const preset = getPreset(presetChoice);
    setEditing(providerConfigFromPreset(presetChoice, config.providers));
    setModels(preset?.models ?? []);
  };

  return (
    <section className={`at-panel${open ? " at-panel--open" : ""}`} aria-hidden={!open}>
      <header className="at-panel__head">
        <div>
          <h2>AI 翻译设置</h2>
          <p className="at-hint">
            当前：{config.activeProviderId ?? "未选择"} · 目标语言 {config.settings.targetLanguage}
          </p>
        </div>
        {onClose ? (
          <button type="button" className="at-btn at-btn--ghost" onClick={onClose}>
            关闭
          </button>
        ) : null}
      </header>

      <nav className="at-tabs">
        {TAB_LABELS.map(([value, label]) => (
          <button
            key={value}
            type="button"
            className={`at-tab${tab === value ? " at-tab--active" : ""}`}
            onClick={() => setTab(value)}
          >
            {label}
          </button>
        ))}
      </nav>

      <div className="at-panel__body">
        {tab === "providers" ? (
          <div className="at-section">
            <h3>模型服务</h3>
            <p className="at-hint">
              支持任意 OpenAI 兼容接口（OpenAI / DeepSeek / Kimi / 通义 / 智谱 / Ollama / One-API…）以及
              Anthropic、Gemini。
            </p>

            <div className="at-providers">
              {config.providers.map((provider) => {
                const active = provider.id === config.activeProviderId;
                return (
                  <div key={provider.id} className={`at-provider${active ? " at-provider--active" : ""}`}>
                    <label className="at-provider__main">
                      <input
                        type="radio"
                        name="at-active-provider"
                        checked={active}
                        onChange={() => persist({ ...config, activeProviderId: provider.id })}
                      />
                      <span className="at-provider__text">
                        <strong>{provider.label ?? provider.id}</strong>
                        <small>
                          {provider.kind} · {provider.model || "未设置模型"}
                          {provider.apiKey ? "" : " · 无密钥"}
                        </small>
                      </span>
                    </label>
                    <div className="at-provider__actions">
                      <button
                        type="button"
                        className="at-btn at-btn--ghost"
                        onClick={() => {
                          setEditing({ ...provider });
                          setModels(getPreset(provider.presetId)?.models ?? []);
                        }}
                      >
                        编辑
                      </button>
                      <button
                        type="button"
                        className="at-btn at-btn--ghost"
                        onClick={async () => {
                          setStatus({ text: "正在测试连接…", error: false });
                          const health = await testProvider(provider, deps);
                          setStatus(
                            health.ok
                              ? {
                                  text: `连接正常 · ${health.latencyMs}ms · ${health.models?.length ?? 0} 个模型`,
                                  error: false,
                                }
                              : { text: `连接失败：${health.error}`, error: true },
                          );
                        }}
                      >
                        测试
                      </button>
                      <button
                        type="button"
                        className="at-btn at-btn--danger"
                        onClick={() => deleteProvider(provider.id)}
                      >
                        删除
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="at-row">
              <select
                className="at-select"
                id="at-preset-select"
                value={presetChoice}
                onChange={(event) => setPresetChoice(event.target.value)}
              >
                {PROVIDER_PRESETS.map((preset) => (
                  <option key={preset.id} value={preset.id}>
                    {preset.label}（{preset.kind}）
                  </option>
                ))}
              </select>
              <button type="button" className="at-btn" onClick={addProvider}>
                添加模型服务
              </button>
            </div>

            {editing ? (
              <ProviderEditor
                provider={editing}
                models={models}
                fetchImpl={fetchImpl}
                onModels={setModels}
                onStatus={setStatus}
                onSave={(provider) => {
                  if (saveProvider(provider)) setEditing(null);
                }}
                onCancel={() => setEditing(null)}
              />
            ) : null}
          </div>
        ) : null}

        {tab === "translation" ? (
          <TranslationSettings
            settings={config.settings}
            onSave={(settings) => persist({ ...config, settings })}
            onReset={() => persist({ ...store.load(), settings: structuredClone(DEFAULT_SETTINGS) })}
          />
        ) : null}

        {tab === "data" ? (
          <DataSection
            config={config}
            onImport={(value) => {
              const result = parseConfig(value);
              if (!result.ok) {
                setStatus({ text: result.errors.join("；"), error: true });
                return;
              }
              persist(result.config);
            }}
            onReset={() => persist(defaultConfig())}
            onStatus={setStatus}
          />
        ) : null}
      </div>

      <p className={`at-status${status.error ? " at-status--error" : ""}`}>{status.text}</p>
    </section>
  );
}

interface ProviderEditorProps {
  provider: ProviderConfig;
  models: string[];
  fetchImpl?: typeof fetch;
  onModels: (models: string[]) => void;
  onStatus: (status: Status) => void;
  onSave: (provider: ProviderConfig) => void;
  onCancel: () => void;
}

function ProviderEditor({
  provider,
  models,
  fetchImpl,
  onModels,
  onStatus,
  onSave,
  onCancel,
}: ProviderEditorProps) {
  const [draft, setDraft] = useState<ProviderConfig>(provider);
  const preset = getPreset(provider.presetId);
  const listId = `at-model-list-${provider.id}`;

  const patch = (changes: Partial<ProviderConfig>): void => setDraft((current) => ({ ...current, ...changes }));

  return (
    <div className="at-editor">
      <h4>{provider.label ?? provider.id} 配置</h4>

      <Field label="显示名称">
        <input
          className="at-input"
          value={draft.label ?? ""}
          placeholder={preset?.label ?? provider.id}
          onChange={(event) => patch({ label: event.target.value })}
        />
      </Field>

      <Field label="接口地址 baseUrl">
        <input
          className="at-input"
          value={draft.baseUrl ?? ""}
          placeholder={preset?.baseUrl ?? "https://api.openai.com/v1"}
          onChange={(event) => patch({ baseUrl: event.target.value })}
        />
      </Field>

      <Field label="API Key" hint="仅保存在本机浏览器存储中，不会上传。">
        <input
          className="at-input"
          type="password"
          value={draft.apiKey ?? ""}
          placeholder={preset?.requiresApiKey === false ? "本地服务可留空" : "sk-..."}
          onChange={(event) => patch({ apiKey: event.target.value })}
        />
      </Field>

      <Field label="模型">
        <input
          className="at-input"
          list={listId}
          value={draft.model}
          placeholder={preset?.defaultModel ?? "model-name"}
          onChange={(event) => patch({ model: event.target.value })}
        />
        <datalist id={listId}>
          {models.map((model) => (
            <option key={model} value={model} />
          ))}
        </datalist>
      </Field>

      <Field label="请求路径 path" hint="Azure 等需要自定义路径时填写。">
        <input
          className="at-input"
          value={draft.path ?? ""}
          placeholder="/chat/completions"
          onChange={(event) => patch({ path: event.target.value })}
        />
      </Field>

      <label className="at-check">
        <input
          type="checkbox"
          checked={draft.streamUsage === true}
          onChange={(event) => patch({ streamUsage: event.target.checked })}
        />
        <span>请求流式 usage（部分服务需要开启）</span>
      </label>

      <div className="at-row">
        <button
          type="button"
          className="at-btn"
          onClick={() => onSave({ ...draft, label: draft.label?.trim() || undefined })}
        >
          保存
        </button>
        <button
          type="button"
          className="at-btn at-btn--ghost"
          onClick={async () => {
            onStatus({ text: "正在拉取模型列表…", error: false });
            try {
              const providerInstance = createProvider(draft, fetchImpl ? { fetchImpl } : {});
              const fetched = await providerInstance.listModels();
              onModels(fetched);
              onStatus({ text: `获取到 ${fetched.length} 个模型`, error: false });
              if (fetched[0] && !draft.model.trim()) patch({ model: fetched[0] });
            } catch (error) {
              onStatus({ text: `获取模型失败：${errorMessage(error)}`, error: true });
            }
          }}
        >
          获取模型
        </button>
        <button type="button" className="at-btn at-btn--ghost" onClick={onCancel}>
          取消
        </button>
      </div>
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="at-field">
      <span className="at-field__label">{label}</span>
      {children}
      {hint ? <small className="at-field__hint">{hint}</small> : null}
    </label>
  );
}

interface TranslationSettingsProps {
  settings: TranslationSettings;
  onSave: (settings: TranslationSettings) => void;
  onReset: () => void;
}

function TranslationSettings({ settings, onSave, onReset }: TranslationSettingsProps) {
  const [draft, setDraft] = useState<TranslationSettings>(settings);
  const [glossaryText, setGlossaryText] = useState(() => formatGlossaryText(settings.glossary));

  useEffect(() => {
    setDraft(settings);
    setGlossaryText(formatGlossaryText(settings.glossary));
  }, [settings]);

  const patch = (changes: Partial<TranslationSettings>): void =>
    setDraft((current) => ({ ...current, ...changes }));

  return (
    <div className="at-section">
      <h3>翻译设置</h3>
      <div className="at-grid">
        <Field label="默认源语言">
          <LanguageSelect
            className="at-select"
            includeAuto
            value={draft.autoDetect ? "auto" : draft.sourceLanguage}
            onChange={(value) =>
              patch({ autoDetect: value === "auto", sourceLanguage: value === "auto" ? "auto" : value })
            }
          />
        </Field>
        <Field label="默认目标语言">
          <LanguageSelect
            className="at-select"
            value={draft.targetLanguage}
            onChange={(value) => patch({ targetLanguage: value })}
          />
        </Field>
        <Field label="识别失败时回退">
          <LanguageSelect
            className="at-select"
            value={draft.fallbackSourceLanguage}
            onChange={(value) => patch({ fallbackSourceLanguage: value })}
          />
        </Field>
        <Field label="语气风格">
          <select
            className="at-select"
            value={draft.tone}
            onChange={(event) => patch({ tone: event.target.value as Tone })}
          >
            {TONES.map((tone) => (
              <option key={tone} value={tone}>
                {TONE_LABELS[tone]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="自动识别策略">
          <select
            className="at-select"
            value={draft.detectStrategy}
            onChange={(event) => patch({ detectStrategy: event.target.value as TranslationSettings["detectStrategy"] })}
          >
            <option value="hybrid">混合（推荐）</option>
            <option value="heuristic">仅本地规则</option>
            <option value="llm">总是询问模型</option>
          </select>
        </Field>
        <Field label="批量方式">
          <select
            className="at-select"
            value={draft.batchMode}
            onChange={(event) => patch({ batchMode: event.target.value as TranslationSettings["batchMode"] })}
          >
            <option value="segment">逐段请求（更稳）</option>
            <option value="json">JSON 批量（更快）</option>
          </select>
        </Field>
        <Field label="领域">
          <input
            className="at-input"
            value={draft.domain ?? ""}
            placeholder="例如：法律合同、医学论文"
            onChange={(event) => patch({ domain: event.target.value })}
          />
        </Field>
        <Field label="目标读者">
          <input
            className="at-input"
            value={draft.audience ?? ""}
            placeholder="例如：普通消费者"
            onChange={(event) => patch({ audience: event.target.value })}
          />
        </Field>
        <Field label="分段长度（字符）">
          <input
            className="at-input"
            type="number"
            min={200}
            max={200000}
            step={100}
            value={draft.chunkSize}
            onChange={(event) => patch({ chunkSize: Number(event.target.value) })}
          />
        </Field>
        <Field label="temperature">
          <input
            className="at-input"
            type="number"
            min={0}
            max={2}
            step={0.1}
            value={draft.temperature}
            onChange={(event) => patch({ temperature: Number(event.target.value) })}
          />
        </Field>
      </div>

      <Field label="术语表（每行 原文 = 译文）">
        <textarea
          className="at-textarea"
          rows={5}
          placeholder={"cluster = 集群\nprompt = 提示词"}
          value={glossaryText}
          onChange={(event) => setGlossaryText(event.target.value)}
        />
      </Field>

      <div className="at-checks">
        <label className="at-check">
          <input
            type="checkbox"
            checked={draft.preserveFormatting}
            onChange={(event) => patch({ preserveFormatting: event.target.checked })}
          />
          <span>保留 Markdown 与换行格式</span>
        </label>
        <label className="at-check">
          <input
            type="checkbox"
            checked={draft.skipSameLanguage}
            onChange={(event) => patch({ skipSameLanguage: event.target.checked })}
          />
          <span>源语言与目标语言相同时跳过翻译</span>
        </label>
        <label className="at-check">
          <input
            type="checkbox"
            checked={draft.cache.enabled}
            onChange={(event) => patch({ cache: { ...draft.cache, enabled: event.target.checked } })}
          />
          <span>启用译文缓存</span>
        </label>
      </div>

      <div className="at-row">
        <button
          type="button"
          className="at-btn"
          onClick={() =>
            onSave(mergeSettings(draft, { glossary: parseGlossaryText(glossaryText) }))
          }
        >
          保存设置
        </button>
        <button type="button" className="at-btn at-btn--ghost" onClick={onReset}>
          恢复翻译默认值
        </button>
      </div>
    </div>
  );
}

interface DataSectionProps {
  config: AppConfig;
  onImport: (value: string) => void;
  onReset: () => void;
  onStatus: (status: Status) => void;
}

function DataSection({ config, onImport, onReset, onStatus }: DataSectionProps) {
  const [text, setText] = useState(() => exportConfigJson(config, { includeSecrets: false }));

  useEffect(() => {
    setText(exportConfigJson(config, { includeSecrets: false }));
  }, [config]);

  return (
    <div className="at-section">
      <h3>配置导入导出</h3>
      <p className="at-hint">导出的 JSON 已隐藏 API Key，可直接分享；导入时会自动校验并补全默认值。</p>
      <textarea
        className="at-textarea"
        rows={10}
        spellCheck={false}
        value={text}
        onChange={(event) => setText(event.target.value)}
      />
      <div className="at-row">
        <button type="button" className="at-btn" onClick={() => onImport(text)}>
          导入这段配置
        </button>
        <button
          type="button"
          className="at-btn at-btn--ghost"
          onClick={async () => {
            const value = exportConfigJson(config, { includeSecrets: false });
            setText(value);
            try {
              await navigator.clipboard.writeText(value);
              onStatus({ text: "已复制到剪贴板", error: false });
            } catch {
              onStatus({ text: "复制失败，请手动选择文本", error: true });
            }
          }}
        >
          复制导出内容
        </button>
        <button type="button" className="at-btn at-btn--danger" onClick={onReset}>
          重置全部配置
        </button>
      </div>
    </div>
  );
}
