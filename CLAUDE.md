# strudel

GitHub mirror of <https://codeberg.org/uzu/strudel>. Live coding music environment (TidalCycles port to JavaScript). AGPL-3.0-or-later.

## Upstream Sync

`.github/workflows/sync-upstream.yml` runs daily (06:00 UTC) and on manual dispatch.

- Fetches `main` and tags from Codeberg
- Opens a PR (`upstream-sync` -> `main`) if there are new commits
- Auto-merges the PR if there are no conflicts; otherwise leaves it open for manual resolution

## Commands

```sh
pnpm dev              # start Astro dev server (localhost:4321)
pnpm test             # run all tests (Vitest)
pnpm lint             # ESLint check
pnpm codeformat       # format with Prettier
pnpm format-check     # check formatting
pnpm check            # format-check + lint + test (CI equivalent)
pnpm snapshot         # regenerate test snapshots
pnpm jsdoc-json       # generate API docs (doc.json)
```

## Monorepo Layout

pnpm workspaces + Lerna (independent versioning). 30+ packages under `@strudel/*`.

- `packages/core/` - pattern engine (the TidalCycles port)
- `packages/mini/` - mini notation parser (PEG grammar in `krill.pegjs`, compiled to `krill-parser.js`)
- `packages/transpiler/` - JS transpiler with plugin architecture (Acorn + escodegen)
- `packages/webaudio/` - Web Audio synthesis
- `packages/codemirror/` - CodeMirror editor integration
- `packages/repl/` - REPL web component
- `website/` - Astro 5 + React 19 + Tailwind CSS
- `src-tauri/` - desktop app (Rust/Tauri)
- `examples/` - example projects

Internal deps use `workspace:*`. Each package builds with Vite to `dist/index.mjs`.

## Code Conventions

- ES modules throughout: `.mjs` for JS modules, `.jsx` for React components
- Prettier: 120 char width, single quotes, trailing commas, 2-space indent, LF line endings
- ESLint: `eslint:recommended` + `eslint-plugin-import`
- Functional composition over OOP inheritance
- `register()` to add functions to `Pattern` prototype; `registerControl()` for audio controls
- Run `pnpm check` before opening a PR

## Gotchas

- Always use **pnpm**, not npm (publishConfig override requires pnpm for publishing)
- Do not edit `krill-parser.js` directly; edit `krill.pegjs` and rebuild with `npm run build:parser` in `packages/mini/`
- Node 18+ required (.nvmrc specifies 22)
- Upstream AI/LLM policy: disclose LLM usage in PRs; wholly LLM-generated code is not accepted upstream
