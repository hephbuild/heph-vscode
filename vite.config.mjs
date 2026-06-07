import { defineConfig } from "vite";
import { builtinModules } from "node:module";

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
        ],
      },
    },
    // SSR mode externalizes deps by default; force-bundle them instead.
    ssr: {
      noExternal: true,
    },
  };
});
