export interface TranslationPayload {
  source: string;
  translated: string;
  target: string;
  meta: string;
}

export type ExtensionRequest =
  | { type: "at:translate"; text: string; from?: string; to?: string }
  | { type: "at:get-selection" };

export type ExtensionResponse =
  | { ok: true; payload: TranslationPayload }
  | { ok: false; error: string; code?: string };

export type BackgroundPush =
  | { type: "at:show-translation"; payload: TranslationPayload }
  | { type: "at:show-error"; message: string }
  | { type: "at:show-loading"; text: string };

export const CONFIG_STORAGE_KEY = "ai-translator:config:v1";

