/// <reference types="chrome" />

import { useCallback, useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import type { BackgroundPush, ExtensionRequest, ExtensionResponse, TranslationPayload } from "./messages.ts";

const MAX_SELECTION_CHARS = 6000;

const STYLES = `
:host { all: initial; }
.wrap { position: fixed; z-index: 2147483647; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", sans-serif; font-size: 14px; color: #16181d; }
.bubble { position: fixed; display: flex; align-items: center; gap: 6px; padding: 5px 9px; border: none; border-radius: 8px; background: #2f6bff; color: #fff; font-size: 13px; font-weight: 600; cursor: pointer; box-shadow: 0 6px 18px rgba(19,24,33,.28); }
.bubble:hover { filter: brightness(1.07); }
.card { position: fixed; width: min(400px, 92vw); display: flex; flex-direction: column; overflow: hidden; border-radius: 12px; background: #fff; border: 1px solid #dfe3e8; box-shadow: 0 18px 48px rgba(19,24,33,.28); }
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

type View =
  | { kind: "hidden" }
  | { kind: "bubble"; x: number; y: number }
  | { kind: "loading"; x: number; y: number; text: string }
  | { kind: "result"; x: number; y: number; payload: TranslationPayload }
  | { kind: "error"; x: number; y: number; message: string };

function currentSelection(): string {
  const selection = window.getSelection();
  return selection && !selection.isCollapsed ? selection.toString().trim() : "";
}

function selectionAnchor(): { x: number; y: number } | null {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return null;
  const rect = selection.getRangeAt(0).getBoundingClientRect();
  if (rect.width === 0 && rect.height === 0) return null;
  return { x: rect.left, y: rect.bottom + 8 };
}

function clamp(x: number, y: number, width: number, height: number): { x: number; y: number } {
  return {
    x: Math.max(12, Math.min(x, Math.max(12, window.innerWidth - width - 12))),
    y: Math.max(12, Math.min(y, Math.max(12, window.innerHeight - height - 12))),
  };
}

function writeClipboard(text: string): void {
  void navigator.clipboard.writeText(text).catch(() => {
    const area = document.createElement("textarea");
    area.value = text;
    area.style.cssText = "position:fixed;opacity:0;";
    document.body.append(area);
    area.select();
    document.execCommand("copy");
    area.remove();
  });
}

function ContentApp({ host }: { host: HTMLElement }) {
  const [view, setView] = useState<View>({ kind: "hidden" });
  const pointer = useRef({ x: 24, y: 24 });
  const anchor = useRef({ x: 24, y: 24 });
  const pending = useRef("");

  const requestTranslation = useCallback((text: string, position: { x: number; y: number }) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    pending.current = trimmed;
    setView({ kind: "loading", x: position.x, y: position.y, text: trimmed });
    const request: ExtensionRequest = { type: "at:translate", text: trimmed };
    chrome.runtime.sendMessage(request, (response: ExtensionResponse | undefined) => {
      if (chrome.runtime.lastError || !response) {
        setView({
          kind: "error",
          x: position.x,
          y: position.y,
          message: chrome.runtime.lastError?.message ?? "扩展后台未响应",
        });
        return;
      }
      setView(
        response.ok
          ? { kind: "result", x: position.x, y: position.y, payload: response.payload }
          : { kind: "error", x: position.x, y: position.y, message: response.error },
      );
    });
  }, []);

  useEffect(() => {
    const insideHost = (event: Event): boolean => event.composedPath().includes(host);

    const onMouseMove = (event: MouseEvent): void => {
      pointer.current = { x: event.clientX, y: event.clientY };
    };
    const onMouseUp = (event: MouseEvent): void => {
      if (insideHost(event)) return;
      setTimeout(() => {
        const text = currentSelection();
        if (!text || text.length > MAX_SELECTION_CHARS) {
          setView({ kind: "hidden" });
          return;
        }
        const position = selectionAnchor() ?? { x: pointer.current.x, y: pointer.current.y + 12 };
        anchor.current = position;
        setView({ kind: "bubble", ...position });
      }, 10);
    };
    const onMouseDown = (event: MouseEvent): void => {
      if (!insideHost(event)) setView((current) => (current.kind === "bubble" ? { kind: "hidden" } : current));
    };
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "Escape") setView({ kind: "hidden" });
    };

    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
    document.addEventListener("mousedown", onMouseDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
      document.removeEventListener("mousedown", onMouseDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [host]);

  useEffect(() => {
    const onMessage = (message: BackgroundPush): void => {
      const position = { x: pointer.current.x, y: pointer.current.y + 14 };
      if (message?.type === "at:show-loading") {
        pending.current = message.text;
        setView({ kind: "loading", x: position.x, y: position.y, text: message.text });
      } else if (message?.type === "at:show-translation") {
        setView({ kind: "result", x: position.x, y: position.y, payload: message.payload });
      } else if (message?.type === "at:show-error") {
        setView({ kind: "error", x: position.x, y: position.y, message: message.message });
      }
    };
    chrome.runtime.onMessage.addListener(onMessage);
    return () => chrome.runtime.onMessage.removeListener(onMessage);
  }, []);

  if (view.kind === "hidden") return null;

  if (view.kind === "bubble") {
    const spot = clamp(view.x, view.y, 56, 34);
    return (
      <button
        type="button"
        className="bubble"
        style={{ left: spot.x, top: spot.y }}
        onMouseDown={(event) => {
          event.preventDefault();
          event.stopPropagation();
        }}
        onClick={() => {
          const text = currentSelection() || pending.current;
          requestTranslation(text, anchor.current);
        }}
      >
        译
      </button>
    );
  }

  const spot = clamp(view.x, view.y, 400, Math.min(420, window.innerHeight - 60));
  const state = view.kind === "loading" ? "loading" : view.kind === "error" ? "error" : "ready";
  const badge =
    view.kind === "result"
      ? `${view.payload.source} → ${view.payload.target}`
      : view.kind === "loading"
        ? "翻译中…"
        : "翻译失败";

  return (
    <div className="card" style={{ left: spot.x, top: spot.y, maxHeight: Math.max(180, window.innerHeight - 80) }}>
      <div className="card__head">
        <span className="badge">{badge}</span>
        <span className="meta">{view.kind === "result" ? view.payload.meta : ""}</span>
      </div>
      <div className="card__body" data-state={state}>
        {view.kind === "result"
          ? view.payload.translated
          : view.kind === "loading"
            ? view.text.length > 120
              ? `${view.text.slice(0, 120)}…`
              : view.text
            : view.message}
      </div>
      <div className="card__foot">
        <button
          type="button"
          className="ghost"
          onClick={() => requestTranslation(pending.current, anchor.current)}
        >
          重试
        </button>
        <button
          type="button"
          className="ghost"
          disabled={view.kind !== "result"}
          onClick={() => {
            if (view.kind === "result") writeClipboard(view.payload.translated);
          }}
        >
          复制
        </button>
        <button type="button" className="ghost" onClick={() => setView({ kind: "hidden" })}>
          关闭
        </button>
      </div>
    </div>
  );
}

const host = document.createElement("div");
host.id = "ai-translator-root";
host.style.cssText = "all: initial; position: fixed; top: 0; left: 0; width: 0; height: 0;";
const shadow = host.attachShadow({ mode: "open" });
const style = document.createElement("style");
style.textContent = STYLES;
const container = document.createElement("div");
container.className = "wrap";
shadow.append(style, container);
document.documentElement.append(host);

createRoot(container).render(<ContentApp host={host} />);
