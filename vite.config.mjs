import { defineConfig } from "vite";
import { builtinModules } from "node:module";

// vscode-languageclient and its transitive deps are kept as runtime `require`s
// (not bundled): the lib's dynamic CommonJS exports get mangled by the
// minifier (e.g. the TransportKind enum export disappears). These packages are
// shipped in node_modules via .vscodeignore instead.
const lspExternals = [
  "vscode-languageclient",
  "vscode-languageserver-protocol",
  "vscode-languageserver-types",
  "vscode-jsonrpc",
  "semver",
  "minimatch",
  "brace-expansion",
  "balanced-match",
  "concat-map",
];

// Matches an LSP external package or any of its subpaths (e.g.
// "vscode-languageclient/node").
const lspExternalRe = new RegExp(
  `^(${lspExternals.map((p) => p.replace(/[/\\^$*+?.()|[\]{}]/g, "\\$&")).join("|")})(/|$)`
);

// VS Code extension is a CommonJS node module. Build it as a single bundled
// dist/extension.js with vite library mode: keep `vscode` and node builtins
// external (the host provides them), bundle everything else (e.g. lru-cache).
export default defineConfig(({ mode }) => {
  const dev = mode === "development";
  return {
    build: {
      target: "node20",
      outDir: "dist",
      emptyOutDir: true,
      minify: !dev,
      sourcemap: dev,
      lib: {
        entry: "src/extension.ts",
        formats: ["cjs"],
        fileName: () => "extension.js",
      },
      rollupOptions: {
        external: [
          "vscode",
          ...builtinModules,
          ...builtinModules.map((m) => `node:${m}`),
          lspExternalRe,
        ],
      },
    },
    // SSR mode externalizes deps by default; force-bundle them instead — except
    // the LSP packages, which must stay external (see lspExternals above).
    ssr: {
      noExternal: true,
      external: lspExternals,
    },
  };
});
