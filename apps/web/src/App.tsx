import {
  createLocalConfigStore,
  resolveActiveProvider,
  textStats,
  type DetectionResult,
  type TranslationResult,
} from "@ai-translator/core";
import {
  LanguageSelect,
  SettingsPanel,
  activeProviderLabel,
  copyText,
  detectionBadge,
  errorMessage,
  resultMeta,
  useConfig,
  useDebounced,
  useTranslator,
} from "@ai-translator/ui";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

const store = createLocalConfigStore();
const AUTO_DETECT_DELAY = 900;

export function TranslatorApp() {
  const config = useConfig(store);
  const { translator } = useTranslator(config);

  const [from, setFrom] = useState(config.settings.autoDetect ? "auto" : config.settings.sourceLanguage);
  const [to, setTo] = useState(config.settings.targetLanguage);
  const [input, setInput] = useState("");
  const [output, setOutput] = useState("");
  const [result, setResult] = useState<TranslationResult | null>(null);
  const [detection, setDetection] = useState<DetectionResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [autoTranslate, setAutoTranslate] = useState(false);
  const [stream, setStream] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const controller = useRef<AbortController | null>(null);

  useEffect(() => {
    setFrom(config.settings.autoDetect ? "auto" : config.settings.sourceLanguage);
    setTo(config.settings.targetLanguage);
  }, [config.settings.autoDetect, config.settings.sourceLanguage, config.settings.targetLanguage]);

  const provider = useMemo(() => resolveActiveProvider(config), [config]);
  const stats = useMemo(() => (input.trim() ? textStats(input) : null), [input]);
  const debouncedInput = useDebounced(input, AUTO_DETECT_DELAY, autoTranslate);

  const translate = useCallback(
    async (text: string) => {
      if (!text.trim()) {
        setError("请先输入需要翻译的内容。");
        return;
      }
      if (!resolveActiveProvider(config)) {
        setError("还没有可用的模型服务，请先在设置里添加一个。");
        setSettingsOpen(true);
        return;
      }
      controller.current?.abort();
      const active = new AbortController();
      controller.current = active;
      setError(null);
      setBusy(true);
      setOutput("");
      setResult(null);
      const options = { from, to, signal: active.signal };

      try {
        if (!stream) {
          const translated = await translator.translate(text, options);
          setOutput(translated.text);
          setResult(translated);
          return;
        }
        let streamed = "";
        let finished: TranslationResult | null = null;
        try {
          for await (const event of translator.streamTranslate(text, options)) {
            if (event.type === "delta") {
              streamed += event.text;
              setOutput(streamed);
            } else if (event.type === "detected") {
              setDetection(event.result);
            } else if (event.type === "done") {
              finished = event.result;
            }
          }
        } catch (streamError) {
          if (streamed.length > 0) throw streamError;
          const translated = await translator.translate(text, options);
          setOutput(translated.text);
          setResult(translated);
          return;
        }
        if (finished) {
          setOutput(finished.text);
          setResult(finished);
        }
      } catch (cause) {
        if (active.signal.aborted) return;
        setError(errorMessage(cause));
        setOutput((current) => current || "翻译失败，请检查模型服务配置。");
      } finally {
        if (controller.current === active) controller.current = null;
        setBusy(false);
      }
    },
    [config, from, stream, to, translator],
  );

  useEffect(() => {
    if (!autoTranslate || !debouncedInput.trim() || busy) return;
    void translate(debouncedInput);
  }, [debouncedInput, autoTranslate]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
        event.preventDefault();
        void translate(input);
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [input, translate]);

  const swapLanguages = (): void => {
    const detected = result?.source.language;
    const nextFrom = from === "auto" ? (detected ?? config.settings.fallbackSourceLanguage) : from;
    setFrom(to);
    setTo(nextFrom);
    if (result && input.trim() === result.text.trim()) {
      setInput(result.text);
      setOutput("");
      setResult(null);
    }
  };

  return (
    <main className="at-app">
      <header className="at-app__head">
        <div>
          <h1 className="at-app__title">AI 翻译工作台</h1>
          <p className="at-app__subtitle">
            接入你自己的大模型服务，自动识别语言后翻译，支持流式输出与术语约束。
          </p>
        </div>
        <div className="at-app__head-actions">
          <span className="at-badge">{activeProviderLabel(config)}</span>
          <button type="button" className="at-btn at-btn--ghost" onClick={() => setSettingsOpen(true)}>
            设置
          </button>
        </div>
      </header>

      <section className="at-langbar">
        <LanguageSelect className="at-select" includeAuto title="源语言" value={from} onChange={setFrom} />
        <button type="button" className="at-btn at-btn--ghost" title="交换语言" onClick={swapLanguages}>
          ⇄
        </button>
        <LanguageSelect className="at-select" title="目标语言" value={to} onChange={setTo} />
        <span className="at-langbar__arrow">→</span>
        <label className="at-check">
          <input
            type="checkbox"
            checked={autoTranslate}
            onChange={(event) => setAutoTranslate(event.target.checked)}
          />
          <span>输入后自动翻译</span>
        </label>
        <label className="at-check">
          <input type="checkbox" checked={stream} onChange={(event) => setStream(event.target.checked)} />
          <span>流式输出</span>
        </label>
        <span className="at-langbar__spacer" />
        <span className="at-meta">
          {stats ? `${stats.characters} 字符 · ${stats.words} 词/字 · ${stats.lines} 行` : ""}
        </span>
      </section>

      {error ? <div className="at-error">{error}</div> : null}

      <section className="at-columns">
        <div className="at-card">
          <div className="at-card__head">
            <span>原文</span>
            <div className="at-toolbar">
              <button
                type="button"
                className="at-btn at-btn--ghost"
                onClick={async () => {
                  try {
                    setInput(await navigator.clipboard.readText());
                  } catch {
                    setError("无法读取剪贴板，请手动粘贴。");
                  }
                }}
              >
                粘贴
              </button>
              <button
                type="button"
                className="at-btn at-btn--ghost"
                onClick={() => {
                  setInput("");
                  setOutput("");
                  setResult(null);
                  setDetection(null);
                  setError(null);
                }}
              >
                清空
              </button>
            </div>
          </div>
          <div className="at-card__body">
            <textarea
              className="at-input-area"
              placeholder="输入或粘贴要翻译的内容…"
              spellCheck={false}
              value={input}
              onChange={(event) => setInput(event.target.value)}
            />
          </div>
          <div className="at-card__foot">
            <span>⌘/Ctrl + Enter 翻译</span>
            <div className="at-toolbar">
              <button
                type="button"
                className="at-btn"
                disabled={busy || !provider}
                onClick={() => void translate(input)}
              >
                {busy ? "翻译中…" : "翻译"}
              </button>
            </div>
          </div>
        </div>

        <div className="at-card">
          <div className="at-card__head">
            <span>译文</span>
            <div className="at-toolbar">
              <button
                type="button"
                className="at-btn at-btn--ghost"
                disabled={!result}
                onClick={async () => {
                  const ok = await copyText(output);
                  if (!ok) setError("复制失败，请手动选择文本。");
                }}
              >
                复制译文
              </button>
            </div>
          </div>
          <div className="at-card__body">
            <div
              className={`at-output${output ? "" : " at-output--placeholder"}${busy ? " at-output--streaming" : ""}`}
            >
              {output || "翻译结果会显示在这里。"}
            </div>
          </div>
          <div className="at-card__foot">
            <div className="at-meta">
              {result ? <span className="at-badge at-badge--muted">{detectionBadge(result)}</span> : null}
            </div>
            <span className="at-meta">
              {result
                ? result.warnings.length > 0
                  ? `${resultMeta(result)} · ${result.warnings.join("；")}`
                  : resultMeta(result)
                : detection
                  ? `识别中：${detection.language}`
                  : ""}
            </span>
          </div>
        </div>
      </section>

      <footer className="at-footer-links">
        <span>{config.providers.length} 个模型服务已配置</span>
        <span>配置仅保存在本机浏览器存储，API Key 不会上传到任何第三方服务。</span>
      </footer>

      <SettingsPanel
        store={store}
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
      />
    </main>
  );
}
