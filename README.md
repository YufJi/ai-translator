# AI 翻译（AI Translator）

一个基于大模型的翻译应用，同时提供 **Web 应用** 与 **浏览器扩展** 两种形态。

- 可接入任意 **自定义大模型 Provider**（OpenAI 兼容协议 / Anthropic / Gemini，含本地 Ollama、LM Studio、自建网关）
- 翻译 **from → to** 支持 **自动识别源语言**，覆盖中文（简/繁）、英语（美/英）、日语、韩语等 31 种主流语言
- 内置桌面级翻译工作台：流式输出、术语表约束、语气/领域控制、译文缓存、长文自动分段
- 扩展形态：**选中即译**（浮动按钮 + 右键菜单 + `Alt+Shift+T` 快捷键）、弹窗快速翻译、设置页

## 目录结构

```
packages/core       翻译引擎：语言识别、提示词、分段、缓存、Provider 适配
packages/ui         与框架无关的 DOM 组件（设置面板、语言选择、格式化）
apps/web            Web 应用（Bun 打包，无框架）
apps/extension      Chrome/Edge MV3 扩展（background / content / popup / options）
```

`packages/core` 不依赖任何运行时 npm 包，也不依赖 DOM，因此同一份逻辑同时跑在浏览器、扩展 Service Worker 和 Node 测试里。

## 快速开始

前置要求：Node.js ≥ 22.6（可直接运行 TypeScript）、Bun（打包）、pnpm（可选，仅用于开发依赖）。

```bash
# 安装开发依赖（仅 typescript / @types，用于类型检查）
pnpm install

# Web 应用
bun run build:web          # 产物在 apps/web/dist
bun run dev:web            # 本地开发服务器 http://localhost:4173

# 浏览器扩展
bun run build:extension    # 产物在 apps/extension/dist
bun run dev:extension      # 监听改动自动重建
bun run preview:extension  # 本地预览扩展 UI：http://localhost:4174
```

加载扩展：打开 `chrome://extensions` → 打开「开发者模式」→「加载已解压的扩展程序」→ 选择 `apps/extension/dist`。

### 不安装也能验证扩展

`apps/extension/preview/` 提供一份最小的 `chrome.*` 桩（`chrome-stub.ts`，实现了 `runtime` 消息、`storage`、`tabs`、`scripting`、`contextMenus`、`commands`），并用它加载扩展的**真实入口文件** `background.ts` / `content.ts` / `popup.ts` / `options.ts`，翻译走离线演示 Provider。因此无需把扩展装进浏览器即可验证三条入口：

- `popup.html` — 打开即模拟「读取当前页面选区 → 翻译」
- `content.html` — 拖选文字触发浮动「译」按钮；页面上的预览控制台还能直接模拟右键菜单与 `Alt+Shift+T`
- `options.html` — 设置面板（增删模型服务、测试连接、术语表等）

该目录只在本地预览时使用，不会被构建进 `apps/extension/dist`。

首次打开无需任何 API Key：默认启用内置的 **离线演示 Provider**，用内置词典演示完整链路（识别 → 分段 → 请求 → 流式渲染 → 缓存）。要翻译真实内容，请在「设置 → 模型服务」里添加你自己的模型服务。

## 模型服务配置

内置预设（一键添加后填写 API Key / 模型名即可）：

| 预设 | 协议 | 默认 Base URL |
| --- | --- | --- |
| OpenAI / DeepSeek / Moonshot / 通义 / 智谱 / SiliconFlow / OpenRouter / Groq / Together / Mistral / xAI | OpenAI 兼容 | 各家官方地址 |
| Ollama / LM Studio / vLLM | OpenAI 兼容 | `http://localhost:11434/v1` 等 |
| Azure OpenAI | OpenAI 兼容 | 需自定义 `path` 与 `apiKeyHeader` |
| One API / New API 等聚合网关 | OpenAI 兼容 | 自填网关地址 |
| Anthropic Claude | Messages API | `https://api.anthropic.com` |
| Google Gemini | generateContent | `https://generativelanguage.googleapis.com` |

每个 Provider 可配置：`baseUrl`、`apiKey`、`model`、`path`、`modelsPath`、`apiKeyHeader`、`apiKeyPrefix`、自定义 `headers`/`body`、`timeoutMs`、`streamUsage`。设置面板支持「测试连接」和「获取模型列表」。

配置保存在浏览器本地（Web 用 `localStorage`，扩展用 `chrome.storage.local`），**API Key 不会上传到除该 Provider 之外的任何地方**；导出配置时默认隐藏 Key。

## 翻译管线

1. **语言识别**：先跑本地规则（Unicode 脚本分析 + 拉丁语种停用词/变音符打分），置信度不足时按配置回退到模型识别或默认源语言。策略可选 `hybrid`（默认）/ `heuristic` / `llm`。
2. **是否跳过**：源语言与目标语言同族且识别可信时跳过请求，直接返回原文。
3. **保护占位符**：代码块、行内代码、URL、邮箱、HTML 标签、`{{var}}`、`${var}`、`%s`、ICU 复数等替换为占位符，模型只翻译自然语言部分，返回后还原。占位符被模型破坏时自动重试一次。
4. **分段**：按句边界切分到 `chunkSize` 字符，保证拼接后与原文逐字符一致（句尾空白跟随上一段）。
5. **请求**：默认逐段并发送，也可开启 JSON 批量模式（一次请求翻译多段，失败自动降级）。
6. **缓存**：以 provider + model + 语言对 + 语气 + 术语表 + 提示词 + 文本的哈希为键做 LRU 缓存。
7. **流式输出**：`streamTranslate()` 逐块产出增量，Web 与扩展弹窗均支持。

## 提示词与术语表

- 语气风格：中性 / 正式书面 / 口语随意 / 技术文档 / 营销文案 / 学术论文 / 直译
- 领域、目标读者、上下文背景均可填写，会注入系统提示词
- 术语表（`原文 = 译文`，每行一条）作为强约束下发，要求模型必须使用指定译法
- 需要完全自定义时，可在配置中提供 `systemPromptOverride`

## 包内 API 速查

```ts
import { Translator, createProvider, detectLanguage, LANGUAGES } from "@ai-translator/core";

const translator = new Translator({ config });

await translator.translate("Hello world.", { to: "zh-Hans" });
// → { text, source: { language, confidence, method }, target, model, cacheHit, latencyMs, usage }

await translator.translate(["First.", "Second."]);  // 数组即批量（带并发上限）

for await (const event of translator.streamTranslate(text)) {
  if (event.type === "delta") render(event.text);
}

await translator.detect("こんにちは");              // 只做识别
await translator.checkProvider();                   // 连通性自检
```

## 开发

```bash
npm run typecheck   # tsc 全量类型检查
npm test            # node --test，77 个用例（引擎 / 识别 / 分段 / Provider / 配置 / 端到端 / 扩展清单）
npm run check       # typecheck + test
npm run verify      # build + typecheck + test（会让扩展产物相关用例真正执行）
npm run build       # 构建 web + extension
```

测试直接运行 TypeScript（Node 22 原生类型剥离），无需构建步骤；Provider 测试通过注入 `fetchImpl` 桩实现，不发真实请求；扩展的清单/图标/产物校验在 `apps/extension/test/extension.test.ts`，未构建时会跳过产物相关断言。

## 关于外壳与「基座」

`packages/core` 与 `packages/ui` 不依赖任何视图框架，也不依赖扩展框架。当前外壳是「原生 MV3 + Bun 打包」，因此若需要换成某个特定基座（例如 WXT / Plasmo / CRXJS 之类的扩展框架，或 Vite / Next 之类的 Web 框架），只需要替换 `apps/*`：

- 会被替换的外壳代码：`apps/extension/src/{background,content,popup,options}.ts`、`manifest.json`、`apps/extension/build.ts` 与 `apps/web/src/main.ts`、`apps/web/index.html`
- 可以原样复用的部分：`packages/core`（引擎与 Provider）、`packages/ui`（设置面板与格式化）、`apps/extension/src/store.ts`（配置存储适配）

## 已知限制

- 浏览器扩展目前只声明 MV3；Firefox 需要自行调整 `manifest.json`（`background.scripts`）。
- 页面内浮动卡片不处理 iframe 内的选区（`all_frames: false`），可在需要时打开。
- 识别器聚焦主流语言；未收录语种（如荷兰语与南非语混合短句）会落到默认源语言。
- 扩展的 Service Worker 会在空闲后被回收，译文缓存随内存一起消失。
