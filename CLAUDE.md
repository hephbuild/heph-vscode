# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

VS Code extension for the [heph](https://github.com/hephbuild/heph) build system. Activates on workspaces containing a `.hephconfig` file. Provides syntax highlighting for `BUILD` files plus heph integration, all backed by shelling out to the `heph` CLI binary.

The extension has two modes, selected by the `heph.mode` setting (`v1` default, change requires a window reload):

- **v0** (`src/v0/`) — for current heph: formatting, code lenses, task running, debug launching, via `heph query`/`heph fmt`.
- **v1** (`src/v1/`) — for next-gen heph: a language client for the LSP served by `heph tool build-lsp`.

Each mode has its own binary setting so both heph generations can coexist: `heph.bin` (v0) and `heph.bin1` (v1). Both default to `heph` on PATH.

## Commands

- `npm ci` — install deps. A SessionStart hook in `.claude/settings.json` runs it automatically when `node_modules` is missing or older than `package-lock.json` (e.g. fresh git worktrees).
- `npm run check-types` — `tsc --noEmit`
- `npm run lint` — eslint (flat config, `eslint.config.mjs`) over `src`. The existing code produces ~100 warnings; only errors matter.
- `npm run compile` — `tsc` to `out/` (used by the tests)
- `npm run bundle` — vite build to `dist/extension.js` (the `main` entry; `vscode-languageclient` and its deps stay external and ship in `node_modules`, see `vite.config.mjs`)
- `npm run watch` — vite build in watch/development mode
- `npm test` — compiles, bundles and lints (`pretest`), then runs `out/test/runTest.js`, which downloads VS Code into `.vscode-test/` and runs the mocha suite in an Electron host. Requires `@vscode/test-electron` ≥ 3.1 (VS Code ≥ 1.110 renamed the macOS executable from `Electron` to `Code`). The suite is currently only a placeholder test.
- `npx --yes @vscode/vsce package` — build a `.vsix`

devenv wraps these as `build` / `watch` / `lint` / `package` scripts (see `devenv.nix`); Node 24 is pinned there (`.nvmrc` mirrors it).

To run the extension live: open in VS Code, press F5 (Extension Development Host). In dev mode the v0 logger auto-shows its output channel.

## Architecture

`src/extension.ts` reads `heph.mode`, sets the `heph.mode` context key (used by `when` clauses in `package.json` menus), prompts for a reload when the mode changes, and dispatches to `src/v0/extension.ts` or `src/v1/extension.ts`.

### v1

`src/v1/lsp.ts` `HephLanguageClient` wraps a `vscode-languageclient` `LanguageClient` that spawns `<heph.bin1> tool build-lsp` over stdio for `hephbuild` documents. Automatic crash restarts are disabled on purpose; `heph.v1.lsp.restart` is the only retry. Failures are logged to the "heph Language Server" output channel.

### v0

`src/v0/extension.ts` `activate()` is the wiring hub — it constructs every provider, registers all commands, and connects them.

**The heph CLI is the source of truth.** `src/v0/command.ts` is the only v0 module that spawns the binary (`bin()` = `heph.bin` setting or `heph` on PATH). All build state comes from `heph query --json=...` (returns `QueryTarget[]`), `heph fmt -` (stdin formatting), and `heph query root`. There is no parsing of BUILD files in the extension itself — queries do the work. When adding a feature that needs build data, add a query function in `command.ts` rather than reading files.

**Invalidation is event-driven and centralized.** `v0/extension.ts` owns an `invalidateEmitter`. The `heph.refreshState` command and the `BUILD`-file `FileSystemWatcher`s (gated on the `buildfiles.watcher.enabled` setting) fire it. Providers subscribe and drop their caches/promises on invalidation, then re-fire their own `onDidChange` to make VS Code re-pull. The chain is: invalidate → `FileRunProvider` re-runs its query → its `onDidChange` → `EditorExt` and `TasksProvider` and code lens refresh.

**Caching pattern.** Providers memoize the in-flight query Promise (not just the result) so concurrent callers share one CLI invocation; invalidation nulls the promise. `BuildCodelensProvider` additionally uses an `LRUCache` keyed by package. `command.ts` `query()` can throw `"Error: deleted"` — `BuildCodelensProvider` treats this as a retry signal, not an error.

**`InFlight`** (`src/v0/inflight.ts`) is a shared counter wrapping query promises (`inFlight.watch(promise)`); `StatusBar` shows a spinner whenever count > 0.

Providers (each registered in `v0/extension.ts`):

- `FileRunProvider` — queries targets carrying `vscode-task` / `vscode-launch` annotations, matches them to files (annotation `.file`, absolute or package-relative). The base data source for editor run configs.
- `EditorExt` — tracks the active editor, turns the active file's matching annotations into run/launch actions, and sets the `heph.hasRunConfigs` context key (drives the editor-title run button + command palette visibility).
- `TasksProvider` — VS Code `TaskProvider` for type `heph`; `query :` lists all targets as tasks. `getTask(addr)` builds a `ProcessExecution` of `heph run <addr> [--force]`.
- `BuildCodelensProvider` — "copy addr" lenses on `BUILD` files. Resolves the package from the file path relative to `query root`, queries `//<pkg>:* || gen_source(...)`, and places lenses at target source positions. Honors `copyAddr.showAll` for private targets.
- `HephBuildDocumentFormatting` — formats `hephbuild` documents via `heph fmt -`.

### Settings ↔ Commands ↔ package.json

`src/v0/consts.ts` defines `Settings` (typed wrappers over `vscode.workspace.getConfiguration("heph")`) and `Commands` (id constants); v1 and `src/extension.ts` read their settings (`mode`, `bin1`) and register commands (`heph.v1.*`) inline. **These string keys must stay in sync with `package.json` `contributes`** (configuration properties, command ids, `taskDefinitions`, menu `when` clauses). The `TargetTaskDefinition` interface in `v0/taskprovider.ts` likewise mirrors the `heph` `taskDefinitions` entry. Changing one requires changing the other.

## Conventions

- TypeScript strict mode; CommonJS; target ES2020. Use `import path = require("path")` style for node builtins (matches existing code).
- In v0, use the `logger` (`src/v0/logger.ts` / `LoggingService.ts`) instead of `console.log` for anything kept; surface errors to users with `vscode.window.showErrorMessage`, guarding repeated errors with a `didShowPromiseError`-style flag. In v1, log to the LSP output channel and offer a "Show Log" action on errors.
- `syntaxes/` holds the TextMate grammar (`hephbuild.tmLanguage.json`) and language config; `icons/` holds the file/logo icons referenced from `package.json`.
