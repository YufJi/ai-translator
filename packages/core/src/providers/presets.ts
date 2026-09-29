import type { ProviderKind } from "./types.ts";

export interface ProviderPreset {
  id: string;
  label: string;
  kind: ProviderKind;
  baseUrl?: string;
  defaultModel: string;
  models: string[];
  requiresApiKey: boolean;
  docsUrl?: string;
  notes?: string;
}

export const PROVIDER_PRESETS: readonly ProviderPreset[] = [
  {
    id: "openai",
    label: "OpenAI",
    kind: "openai-compatible",
    baseUrl: "https://api.openai.com/v1",
    defaultModel: "gpt-4o-mini",
    models: ["gpt-4o-mini", "gpt-4o", "gpt-4.1-mini", "gpt-4.1", "o4-mini"],
    requiresApiKey: true,
    docsUrl: "https://platform.openai.com/docs/api-reference/chat",
  },
  {
    id: "deepseek",
    label: "DeepSeek",
    kind: "openai-compatible",
    baseUrl: "https://api.deepseek.com/v1",
    defaultModel: "deepseek-chat",
    models: ["deepseek-chat", "deepseek-reasoner"],
    requiresApiKey: true,
    docsUrl: "https://api-docs.deepseek.com/",
  },
  {
    id: "moonshot",
    label: "Moonshot / Kimi",
    kind: "openai-compatible",
    baseUrl: "https://api.moonshot.cn/v1",
    defaultModel: "moonshot-v1-8k",
    models: ["moonshot-v1-8k", "moonshot-v1-32k", "kimi-k2-0905-preview"],
    requiresApiKey: true,
    docsUrl: "https://platform.moonshot.cn/docs",
  },
  {
    id: "qwen",
    label: "阿里云百炼 / 通义千问",
    kind: "openai-compatible",
    baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    defaultModel: "qwen-plus",
    models: ["qwen-turbo", "qwen-plus", "qwen-max", "qwen-long"],
    requiresApiKey: true,
    notes: "使用 DashScope 的 OpenAI 兼容模式。",
    docsUrl: "https://help.aliyun.com/zh/model-studio/",
  },
  {
    id: "zhipu",
    label: "智谱 GLM",
    kind: "openai-compatible",
    baseUrl: "https://open.bigmodel.cn/api/paas/v4",
    defaultModel: "glm-4-flash",
    models: ["glm-4-flash", "glm-4-air", "glm-4-plus"],
    requiresApiKey: true,
    docsUrl: "https://open.bigmodel.cn/dev/api",
  },
  {
    id: "siliconflow",
    label: "硅基流动 SiliconFlow",
    kind: "openai-compatible",
    baseUrl: "https://api.siliconflow.cn/v1",
    defaultModel: "Qwen/Qwen2.5-7B-Instruct",
    models: ["Qwen/Qwen2.5-7B-Instruct", "Qwen/Qwen2.5-72B-Instruct", "deepseek-ai/DeepSeek-V3"],
    requiresApiKey: true,
    docsUrl: "https://docs.siliconflow.cn/",
  },
  {
    id: "openrouter",
    label: "OpenRouter",
    kind: "openai-compatible",
    baseUrl: "https://openrouter.ai/api/v1",
    defaultModel: "openai/gpt-4o-mini",
    models: ["openai/gpt-4o-mini", "anthropic/claude-3.5-sonnet", "google/gemini-2.0-flash-001"],
    requiresApiKey: true,
    docsUrl: "https://openrouter.ai/docs",
  },
  {
    id: "groq",
    label: "Groq",
    kind: "openai-compatible",
    baseUrl: "https://api.groq.com/openai/v1",
    defaultModel: "llama-3.3-70b-versatile",
    models: ["llama-3.3-70b-versatile", "llama-3.1-8b-instant"],
    requiresApiKey: true,
    docsUrl: "https://console.groq.com/docs",
  },
  {
    id: "together",
    label: "Together AI",
    kind: "openai-compatible",
    baseUrl: "https://api.together.xyz/v1",
    defaultModel: "meta-llama/Llama-3.3-70B-Instruct-Turbo",
    models: ["meta-llama/Llama-3.3-70B-Instruct-Turbo"],
    requiresApiKey: true,
    docsUrl: "https://docs.together.ai/",
  },
  {
    id: "mistral",
    label: "Mistral AI",
    kind: "openai-compatible",
    baseUrl: "https://api.mistral.ai/v1",
    defaultModel: "mistral-small-latest",
    models: ["mistral-small-latest", "mistral-large-latest"],
    requiresApiKey: true,
    docsUrl: "https://docs.mistral.ai/",
  },
  {
    id: "xai",
    label: "xAI Grok",
    kind: "openai-compatible",
    baseUrl: "https://api.x.ai/v1",
    defaultModel: "grok-2-latest",
    models: ["grok-2-latest", "grok-beta"],
    requiresApiKey: true,
    docsUrl: "https://docs.x.ai/",
  },
  {
    id: "azure-openai",
    label: "Azure OpenAI",
    kind: "openai-compatible",
    baseUrl: "https://YOUR-RESOURCE.openai.azure.com/openai/deployments/YOUR-DEPLOYMENT",
    defaultModel: "gpt-4o-mini",
    models: ["gpt-4o-mini", "gpt-4o"],
    requiresApiKey: true,
    notes: "需要把 path 设为 /chat/completions?api-version=2024-10-21，并将 apiKeyHeader 设为 api-key。",
    docsUrl: "https://learn.microsoft.com/azure/ai-services/openai/",
  },
  {
    id: "ollama",
    label: "Ollama（本地）",
    kind: "openai-compatible",
    baseUrl: "http://localhost:11434/v1",
    defaultModel: "qwen2.5:7b",
    models: ["qwen2.5:7b", "llama3.2", "gemma2:9b"],
    requiresApiKey: false,
    notes: "本地运行时无需 API Key。",
    docsUrl: "https://github.com/ollama/ollama/blob/main/docs/openai.md",
  },
  {
    id: "lmstudio",
    label: "LM Studio（本地）",
    kind: "openai-compatible",
    baseUrl: "http://localhost:1234/v1",
    defaultModel: "local-model",
    models: ["local-model"],
    requiresApiKey: false,
    docsUrl: "https://lmstudio.ai/docs/local-server",
  },
  {
    id: "vllm",
    label: "vLLM / 自建 OpenAI 兼容服务",
    kind: "openai-compatible",
    baseUrl: "http://localhost:8000/v1",
    defaultModel: "Qwen/Qwen2.5-7B-Instruct",
    models: ["Qwen/Qwen2.5-7B-Instruct"],
    requiresApiKey: false,
    docsUrl: "https://docs.vllm.ai/",
  },
  {
    id: "one-api",
    label: "One API / New API 网关",
    kind: "openai-compatible",
    baseUrl: "https://your-gateway.example.com/v1",
    defaultModel: "gpt-4o-mini",
    models: [],
    requiresApiKey: true,
    notes: "聚合网关，模型列表请用“获取模型”按钮拉取。",
  },
  {
    id: "anthropic",
    label: "Anthropic Claude",
    kind: "anthropic",
    baseUrl: "https://api.anthropic.com",
    defaultModel: "claude-3-5-haiku-latest",
    models: ["claude-3-5-haiku-latest", "claude-sonnet-4-5", "claude-opus-4-1"],
    requiresApiKey: true,
    docsUrl: "https://docs.anthropic.com/",
  },
  {
    id: "google",
    label: "Google Gemini",
    kind: "google",
    baseUrl: "https://generativelanguage.googleapis.com",
    defaultModel: "gemini-2.0-flash",
    models: ["gemini-2.0-flash", "gemini-2.0-flash-lite", "gemini-1.5-pro"],
    requiresApiKey: true,
    docsUrl: "https://ai.google.dev/gemini-api/docs",
  },
  {
    id: "mock",
    label: "离线演示（无需 Key）",
    kind: "mock",
    defaultModel: "mock-1",
    models: ["mock-1"],
    requiresApiKey: false,
    notes: "内置词典的模拟翻译，用于无网络、无 API Key 时体验完整流程。",
  },
];

const PRESET_INDEX = new Map(PROVIDER_PRESETS.map((preset) => [preset.id, preset]));

export function getPreset(id: string | undefined): ProviderPreset | undefined {
  return id ? PRESET_INDEX.get(id) : undefined;
}

export function presetsByKind(kind: ProviderKind): ProviderPreset[] {
  return PROVIDER_PRESETS.filter((preset) => preset.kind === kind);
}
