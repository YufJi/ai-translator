import {
  type AppConfig,
  type GlossaryEntry,
  type TranslationResult,
  type TokenUsage,
} from "@ai-translator/core";

export const AUTO_LABEL = "自动识别";

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

export function errorMessage(error: unknown): string {
  if (error && typeof error === "object" && "message" in error) {
    const message = String((error as { message: unknown }).message);
    const code = (error as { code?: string }).code;
    return code ? `${message}（${code}）` : message;
  }
  return String(error);
}

function currentPlatform(): string {
  if (typeof navigator === "undefined") return "";
  return navigator.platform || navigator.userAgent || "";
}

/**
 * Chrome registers the manifest's `Alt+Shift+T` as ⌥⇧T on macOS (its `Alt`
 * modifier *is* the Option key), so the copy must name the key that is actually
 * printed on the keyboard. `darwin` covers Node's platform string in tests.
 */
export function shortcutLabel(platform: string = currentPlatform()): string {
  return /mac|darwin|iphone|ipad/i.test(platform) ? "⌥⇧T" : "Alt+Shift+T";
}
