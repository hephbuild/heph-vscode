# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

VS Code extension for the [heph](https://github.com/hephbuild/heph) build system. Activates on workspaces containing a `.hephconfig` file. Provides syntax highlighting for `BUILD` files, formatting, code lenses, task running, and debug launching — all backed by shelling out to the `heph` CLI binary.

## Commands

- `npm run compile` — build (`tsc -p ./`), output to `out/`
- `npm run watch` — incremental compile on change
- `npm run lint` — eslint (flat config, `eslint.config.mjs`) over `src`
- `npm run test` — runs `out/test/runTest.js` (compiles + lints first via `pretest`); launches an Electron test host
- `npx --yes @vscode/vsce package` — build a `.vsix`

devenv wraps these as `build` / `watch` / `lint` / `package` scripts (see `devenv.nix`); Node 24 is pinned there (`.nvmrc` mirrors it). `npm install` runs automatically on entering the devenv shell.

To run the extension live: open in VS Code, press F5 (Extension Development Host). In dev mode the logger auto-shows its output channel.

## Architecture

`src/extension.ts` `activate()` is the wiring hub — it constructs every provider, registers all commands, and connects them. Everything flows from there.

**The heph CLI is the source of truth.** `src/command.ts` is the only module that spawns the binary (`bin()` = `heph.bin` setting or `heph` on PATH). All build state comes from `heph query --json=...` (returns `QueryTarget[]`), `heph fmt -` (stdin formatting), and `heph query root`. There is no parsing of BUILD files in the extension itself — queries do the work. When adding a feature that needs build data, add a query function in `command.ts` rather than reading files.

**Invalidation is event-driven and centralized.** `extension.ts` owns an `invalidateEmitter`. The `heph.refreshState` command and the `BUILD`-file `FileSystemWatcher`s (gated on the `buildfiles.watcher.enabled` setting) fire it. Providers subscribe and drop their caches/promises on invalidation, then re-fire their own `onDidChange` to make VS Code re-pull. The chain is: invalidate → `FileRunProvider` re-runs its query → its `onDidChange` → `EditorExt` and `TasksProvider` and code lens refresh.

**Caching pattern.** Providers memoize the in-flight query Promise (not just the result) so concurrent callers share one CLI invocation; invalidation nulls the promise. `BuildCodelensProvider` additionally uses an `LRUCache` keyed by package. `command.ts` `query()` can throw `"Error: deleted"` — `BuildCodelensProvider` treats this as a retry signal, not an error.

**`InFlight`** (`src/inflight.ts`) is a shared counter wrapping query promises (`inFlight.watch(promise)`); `StatusBar` shows a spinner whenever count > 0.

### Providers (each registered in `extension.ts`)

- `FileRunProvider` — queries targets carrying `vscode-task` / `vscode-launch` annotations, matches them to files (annotation `.file`, absolute or package-relative). The base data source for editor run configs.
- `EditorExt` — tracks the active editor, turns the active file's matching annotations into run/launch actions, and sets the `heph.hasRunConfigs` context key (drives the editor-title run button + command palette visibility).
- `TasksProvider` — VS Code `TaskProvider` for type `heph`; `query :` lists all targets as tasks. `getTask(addr)` builds a `ProcessExecution` of `heph run <addr> [--force]`.
- `BuildCodelensProvider` — "copy addr" lenses on `BUILD` files. Resolves the package from the file path relative to `query root`, queries `//<pkg>:* || gen_source(...)`, and places lenses at target source positions. Honors `copyAddr.showAll` for private targets.
- `HephBuildDocumentFormatting` — formats `hephbuild` documents via `heph fmt -`.

### Settings ↔ Commands ↔ package.json

`src/consts.ts` defines `Settings` (typed wrappers over `vscode.workspace.getConfiguration("heph")`) and `Commands` (id constants). **These string keys must stay in sync with `package.json` `contributes`** (configuration properties, command ids, `taskDefinitions`). The `TargetTaskDefinition` interface in `taskprovider.ts` likewise mirrors the `heph` `taskDefinitions` entry. Changing one requires changing the other.

## Conventions

- TypeScript strict mode; CommonJS; target ES2020. Use `import path = require("path")` style for node builtins (matches existing code).
- Use the `logger` (`src/logger.ts` / `LoggingService.ts`) instead of `console.log` for anything kept; surface errors to users with `vscode.window.showErrorMessage`, guarding repeated errors with a `didShowPromiseError`-style flag.
- `syntaxes/` holds the TextMate grammar (`hephbuild.tmLanguage.json`) and language config; `icons/` holds the file/logo icons referenced from `package.json`.
