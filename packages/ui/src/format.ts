import {
  LANGUAGES,
  baseLanguage,
  type AppConfig,
  type GlossaryEntry,
  type LanguageDef,
  type TranslationResult,
  type TokenUsage,
} from "../../core/src/index.ts";

export const AUTO_LABEL = "自动识别";

export function languageOptions(
  doc: Document,
  options: { includeAuto?: boolean; selected?: string } = {},
): HTMLOptionElement[] {
  const items: HTMLOptionElement[] = [];
  const push = (value: string, label: string, disabled = false): void => {
    const option = doc.createElement("option");
    option.value = value;
    option.textContent = label;
    option.disabled = disabled;
    items.push(option);
  };
  if (options.includeAuto !== false) push("auto", AUTO_LABEL);
  const primary = LANGUAGES.filter((language) => PINNED.includes(language.tag));
  const rest = LANGUAGES.filter((language) => !PINNED.includes(language.tag));
  for (const language of [...primary, ...rest]) push(language.tag, languageLabel(language));
  return items;
}

const PINNED = ["zh-Hans", "zh-Hant", "en-US", "ja", "ko"];

export function languageLabel(language: LanguageDef): string {
  return `${language.name} · ${language.tag}`;
}

export function fillLanguageSelect(
  select: HTMLSelectElement,
  options: { includeAuto?: boolean; selected?: string } = {},
): void {
  select.replaceChildren(...languageOptions(select.ownerDocument, options));
  if (options.selected) select.value = normalizeForSelect(options.selected);
}

export function normalizeForSelect(tag: string): string {
  return LANGUAGES.find((language) => language.tag.toLowerCase() === tag.toLowerCase())?.tag ?? tag;
}

export function detectionBadge(result: TranslationResult): string {
  const { source, target } = result;
  const confidence = Math.round(source.confidence * 100);
  const sourceLabel = source.language;
  const method =
    source.method === "declared"
      ? "指定"
      : source.method === "llm"
        ? "模型识别"
        : source.method === "fallback"
          ? "默认"
          : "自动识别";
  const suffix = result.skipped ? " · 无需翻译" : ` · ${confidence}%`;
  return `${sourceLabel} → ${target} · ${method}${suffix}`;
}

export function formatUsage(usage: TokenUsage | undefined): string {
  if (!usage) return "";
  const parts: string[] = [];
  if (usage.inputTokens !== undefined) parts.push(`输入 ${usage.inputTokens}`);
  if (usage.outputTokens !== undefined) parts.push(`输出 ${usage.outputTokens}`);
  if (parts.length === 0 && usage.totalTokens !== undefined) parts.push(`tokens ${usage.totalTokens}`);
  return parts.join(" / ");
}

export function resultMeta(result: TranslationResult): string {
  const bits = [
    `${result.providerLabel} · ${result.model}`,
    `${result.latencyMs}ms`,
    result.chunkCount > 1 ? `${result.chunkCount} 段` : "",
    result.cacheHit ? "缓存命中" : "",
    formatUsage(result.usage),
  ].filter(Boolean);
  return bits.join(" · ");
}

export function parseGlossaryText(text: string): GlossaryEntry[] {
  const entries: GlossaryEntry[] = [];
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const separator = trimmed.includes("=>") ? "=>" : trimmed.includes("=") ? "=" : "\t";
    const index = trimmed.indexOf(separator);
    if (index < 0) continue;
    const source = trimmed.slice(0, index).trim();
    const target = trimmed.slice(index + separator.length).trim();
    if (source && target) entries.push({ source, target });
  }
  return entries;
}

export function formatGlossaryText(entries: readonly GlossaryEntry[]): string {
  return entries.map((entry) => `${entry.source} = ${entry.target}`).join("\n");
}

export function sameLanguageFamily(a: string, b: string): boolean {
  return baseLanguage(a) === baseLanguage(b);
}

export function activeProviderLabel(config: AppConfig): string {
  const provider = config.providers.find((entry) => entry.id === config.activeProviderId) ?? config.providers[0];
  if (!provider) return "未配置模型";
  return `${provider.label ?? provider.id} · ${provider.model}`;
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export function downloadFile(filename: string, contents: string, type = "application/json"): void {
  const blob = new Blob([contents], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1_000);
}

export function errorMessage(error: unknown): string {
  if (error && typeof error === "object" && "message" in error) {
    const message = String((error as { message: unknown }).message);
    const code = (error as { code?: string }).code;
    return code ? `${message}（${code}）` : message;
  }
  return String(error);
}

