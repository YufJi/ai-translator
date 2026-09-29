# Repository Guidelines

## Project Structure & Module Organization

- `packages/core` — translation engine (detection, prompts, chunking, cache, providers). **Zero runtime deps, no React/DOM imports** — the same code runs in the browser, the MV3 worker and `node --test`.
- `packages/ui` — React 18 components shared by both shells (`SettingsPanel.tsx`, `hooks.ts`, `styles.css`).
- `apps/web` — Vite + React workbench (`src/App.tsx`, `vite.config.ts`).
- `apps/extension` — MV3 extension (`src/{background,content,popup,options}`, `manifest.json`, generated `icons/`).
- `apps/extension/preview` — browser harness running the real entry files against a `chrome.*` stub; dev-only.
- Tests sit beside their scope: `packages/core/test/`, `apps/extension/test/`.

## Build, Test, and Development Commands

```bash
pnpm install                # install workspace dependencies
pnpm dev:web                # Vite dev server → http://localhost:5173
pnpm preview:extension      # extension harness → http://localhost:4174
pnpm build                  # build web + extension (3 Vite targets)
pnpm typecheck              # tsc across the workspace
pnpm test                   # node --test (79 cases)
pnpm verify                 # build + typecheck + test — required before a PR
```

Extension builds switch on `BUILD_TARGET=pages|background|content`; the latter two must stay self-contained IIFE files.

## Coding Style & Naming Conventions

- TypeScript strict (`noUncheckedIndexedAccess`); 2-space indent, double quotes, semicolons, trailing commas.
- Relative imports keep explicit extensions (`./text.ts`); cross-package imports use package names (`@ai-translator/core`) — never `resolve.alias` or `tsconfig.paths`.
- `camelCase` functions/variables, `PascalCase` components/types, `SCREAMING_SNAKE_CASE` constants; kebab-case filenames except React components.
- No linter/formatter is configured — match the surrounding code. User-visible copy stays Simplified Chinese.

## Testing Guidelines

- `node:test` + `assert/strict`; Node 22 runs `.ts` directly. Name files `*.test.ts` and state the expected behaviour in the title.
- Stub the network with `createFakeProvider()` from `packages/core/test/helpers.ts`; never call real APIs.
- Extension tests validate built artifacts and skip without `dist/` — run `pnpm verify` so they execute.
- Every bug fix lands with a regression test.

## Commit & Pull Request Guidelines

- Conventional Commits with a Chinese summary: `fix(extension): 修复…`, `feat(icons): …`, `build: …`.
- PRs describe the change, link the issue, pass `pnpm verify`, and include screenshots for UI or extension changes.
- Extension changes must also be exercised through `pnpm preview:extension`: `built.html` loads the real `dist/content.js`, `content.html?stale` covers the invalidated-context path.

## Gotchas

- Vite lib/IIFE builds do not replace `process.env.NODE_ENV`; `apps/extension/vite.config.ts` defines it. Without that the content script dies on load and selection translation silently stops working.
- Never hand-edit `apps/extension/icons/*.png`; regenerate them with `pnpm --filter @ai-translator/extension icons`.
- Keep `packages/core` free of React, DOM and Node-only globals.
