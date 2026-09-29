/// <reference types="chrome" />

import type { BackgroundPush, ExtensionRequest, ExtensionResponse, TranslationPayload } from "./messages.ts";

const HOST_ID = "ai-translator-root";
const MAX_SELECTION_CHARS = 6000;

const STYLES = `
:host { all: initial; }
[hidden] { display: none !important; }
.wrap { position: fixed; z-index: 2147483647; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", sans-serif; font-size: 14px; color: #16181d; }
.bubble { position: fixed; display: flex; align-items: center; gap: 6px; padding: 5px 9px; border: none; border-radius: 8px; background: #2f6bff; color: #fff; font-size: 13px; font-weight: 600; cursor: pointer; box-shadow: 0 6px 18px rgba(19,24,33,.28); }
.bubble:hover { filter: brightness(1.07); }
.card { position: fixed; width: min(400px, 92vw); max-height: 60vh; display: flex; flex-direction: column; overflow: hidden; border-radius: 12px; background: #fff; border: 1px solid #dfe3e8; box-shadow: 0 18px 48px rgba(19,24,33,.28); }
.card__head { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 9px 12px; border-bottom: 1px solid #eceff3; background: #f7f8fa; }
.badge { padding: 3px 8px; border-radius: 999px; background: rgba(47,107,255,.12); color: #2f6bff; font-size: 11px; font-weight: 600; }
.meta { font-size: 11px; color: #626a76; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.card__body { padding: 12px; overflow-y: auto; line-height: 1.7; white-space: pre-wrap; word-break: break-word; }
.card__body[data-state="error"] { color: #d64545; }
.card__body[data-state="loading"] { color: #626a76; }
.card__foot { display: flex; justify-content: flex-end; gap: 8px; padding: 8px 12px; border-top: 1px solid #eceff3; }
.ghost { padding: 5px 10px; border: 1px solid #dfe3e8; border-radius: 8px; background: #fff; color: #16181d; font-size: 12px; cursor: pointer; }
.ghost:hover { background: #f0f2f5; }
@media (prefers-color-scheme: dark) {
  .card { background: #1c1f24; border-color: #31353d; color: #eceef2; }
  .card__head { background: #23262c; border-bottom-color: #31353d; }
  .card__foot { border-top-color: #31353d; }
  .badge { background: rgba(111,155,255,.18); color: #6f9bff; }
  .meta { color: #9aa2ae; }
  .ghost { background: #1c1f24; border-color: #31353d; color: #eceef2; }
  .ghost:hover { background: #23262c; }
}
`;

interface Ui {
  host: HTMLElement;
  bubble: HTMLButtonElement;
  card: HTMLDivElement;
  badge: HTMLSpanElement;
  meta: HTMLSpanElement;
  body: HTMLDivElement;
  footer: HTMLDivElement;
  copy: HTMLButtonElement;
  retry: HTMLButtonElement;
  close: HTMLButtonElement;
}

let ui: Ui | null = null;
let payload: TranslationPayload | null = null;
let pendingText = "";
let anchor: { x: number; y: number } = { x: 24, y: 24 };

function ensureUi(): Ui {
  if (ui && ui.host.isConnected) return ui;
  const host = document.createElement("div");
  host.id = HOST_ID;
  host.style.cssText = "all: initial; position: fixed; top: 0; left: 0; width: 0; height: 0;";
  const shadow = host.attachShadow({ mode: "open" });
  const style = document.createElement("style");
  style.textContent = STYLES;

  const bubble = document.createElement("button");
  bubble.className = "bubble";
  bubble.type = "button";
  bubble.textContent = "译";
  bubble.hidden = true;

  const card = document.createElement("div");
  card.className = "card";
  card.hidden = true;
  const head = document.createElement("div");
  head.className = "card__head";
  const badge = document.createElement("span");
  badge.className = "badge";
  badge.textContent = "AI 翻译";
  const meta = document.createElement("span");
  meta.className = "meta";
  head.append(badge, meta);

  const body = document.createElement("div");
  body.className = "card__body";
  const footer = document.createElement("div");
  footer.className = "card__foot";
  const retry = document.createElement("button");
  retry.className = "ghost";
  retry.type = "button";
  retry.textContent = "重试";
  const copy = document.createElement("button");
  copy.className = "ghost";
  copy.type = "button";
  copy.textContent = "复制";
  const close = document.createElement("button");
  close.className = "ghost";
  close.type = "button";
  close.textContent = "关闭";
  footer.append(retry, copy, close);
  card.append(head, body, footer);

  const wrap = document.createElement("div");
  wrap.className = "wrap";
  wrap.append(card, bubble);
  shadow.append(style, wrap);
  document.documentElement.append(host);

  bubble.addEventListener("mousedown", (event) => {
    event.preventDefault();
    event.stopPropagation();
    void translateSelection();
  });
  copy.addEventListener("click", () => {
    if (payload) void writeClipboard(payload.translated);
  });
  retry.addEventListener("click", () => void translateText(pendingText || lastSelection()));
  close.addEventListener("click", () => hideCard());

  ui = { host, bubble, card, badge, meta, body, footer, copy, retry, close };
  return ui;
}

function place(element: HTMLElement, x: number, y: number, width = 320, height = 120): void {
  const maxX = window.innerWidth - width - 12;
  const maxY = window.innerHeight - height - 12;
  element.style.left = `${Math.max(12, Math.min(x, Math.max(12, maxX)))}px`;
  element.style.top = `${Math.max(12, Math.min(y, Math.max(12, maxY)))}px`;
}

function lastSelection(): string {
  const selection = window.getSelection();
  return selection && !selection.isCollapsed ? selection.toString().trim() : "";
}

function showBubble(rect: DOMRect | null): void {
  const view = ensureUi();
  const x = rect ? rect.left : anchor.x;
  const y = rect ? rect.bottom + 8 : anchor.y + 12;
  view.bubble.hidden = false;
  view.bubble.style.position = "fixed";
  place(view.bubble, x, y, 56, 34);
}

function hideBubble(): void {
  if (ui) ui.bubble.hidden = true;
}

function hideCard(): void {
  if (ui) ui.card.hidden = true;
}

function showCard(rect: DOMRect | null = null): void {
  const view = ensureUi();
  view.card.hidden = false;
  const x = rect ? rect.left : anchor.x;
  const y = rect ? rect.bottom + 10 : anchor.y + 14;
  view.card.style.position = "fixed";
  view.card.style.maxHeight = `${Math.max(180, window.innerHeight - 80)}px`;
  place(view.card, x, y, 400, Math.min(420, window.innerHeight - 60));
}

function renderLoading(text: string): void {
  const view = ensureUi();
  showCard();
  view.badge.textContent = "翻译中…";
  view.meta.textContent = "";
  view.body.dataset.state = "loading";
  view.body.textContent = text.length > 120 ? `${text.slice(0, 120)}…` : text;
  view.copy.disabled = true;
}

function renderResult(next: TranslationPayload): void {
  const view = ensureUi();
  payload = next;
  showCard();
  view.badge.textContent = `${next.source} → ${next.target}`;
  view.meta.textContent = next.meta;
  view.body.dataset.state = "ready";
  view.body.textContent = next.translated;
  view.copy.disabled = false;
}

function renderError(message: string): void {
  const view = ensureUi();
  showCard();
  view.badge.textContent = "翻译失败";
  view.meta.textContent = "";
  view.body.dataset.state = "error";
  view.body.textContent = message;
  view.copy.disabled = true;
}

async function translateSelection(): Promise<void> {
  const text = lastSelection();
  hideBubble();
  await translateText(text);
}

async function translateText(text: string): Promise<void> {
  const trimmed = text.trim();
  if (!trimmed) return;
  pendingText = trimmed;
  renderLoading(trimmed);
  const request: ExtensionRequest = { type: "at:translate", text: trimmed };
  chrome.runtime.sendMessage(request, (response: ExtensionResponse | undefined) => {
    if (chrome.runtime.lastError) {
      renderError(chrome.runtime.lastError.message ?? "扩展后台未响应");
      return;
    }
    if (!response) {
      renderError("扩展后台未响应");
      return;
    }
    if (response.ok) renderResult(response.payload);
    else renderError(response.error);
  });
}

async function writeClipboard(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const area = document.createElement("textarea");
    area.value = text;
    area.style.cssText = "position:fixed;opacity:0;";
    document.body.append(area);
    area.select();
    document.execCommand("copy");
    area.remove();
  }
}

document.addEventListener("mousemove", (event) => {
  anchor = { x: event.clientX, y: event.clientY };
});

document.addEventListener("mouseup", (event) => {
  if (ui && (event.target === ui.host || event.composedPath().includes(ui.host))) return;
  setTimeout(() => {
    const text = lastSelection();
    if (!text || text.length > MAX_SELECTION_CHARS) {
      hideBubble();
      return;
    }
    const selection = window.getSelection();
    const rect = selection && selection.rangeCount > 0 ? selection.getRangeAt(0).getBoundingClientRect() : null;
    showBubble(rect);
  }, 10);
});

document.addEventListener("mousedown", (event) => {
  if (!ui) return;
  const path = event.composedPath();
  if (path.includes(ui.host)) return;
  hideBubble();
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    hideBubble();
    hideCard();
  }
});

chrome.runtime.onMessage.addListener((message: BackgroundPush) => {
  if (message?.type === "at:show-loading") renderLoading(message.text);
  else if (message?.type === "at:show-translation") renderResult(message.payload);
  else if (message?.type === "at:show-error") renderError(message.message);
});
