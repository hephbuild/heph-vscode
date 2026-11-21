import * as vscode from "vscode";
import { execFile } from "child_process";
import path = require("path");
import { bin } from "./bin";

// Completion, hover and validation for `.hephconfig` files, from the JSON
// Schema printed by `heph tool config-schema`.
//
// The schema is handed to yaml-language-server through the Red Hat YAML
// extension's contributor API, so `.hephconfig` stays a plain `yaml` document.
// heph publishes no copy of the schema: the binary is the only source, and in
// a workspace that pins a version the self-upgrade re-executes into the pinned
// binary first, so the schema always matches the parser that reads the file.

const YAML_EXTENSION_ID = "redhat.vscode-yaml";

// The contributor name doubles as the URI scheme of the schemas it serves.
const SCHEME = "heph-config-schema";

// In a pinned workspace the command may first download the pinned binary.
const TIMEOUT_MS = 60_000;

// What yaml-language-server gets when the command fails: an empty schema,
// which accepts anything and offers nothing, so the file reads as plain YAML.
const EMPTY_SCHEMA = JSON.stringify({
  $schema: "https://json-schema.org/draft/2020-12/schema",
});

const DONT_ASK_YAML_KEY = "heph.v1.configSchema.dontAskForYamlExtension";

// The base config, its legacy name, and the profiles laid over them
// (`ci.hephconfig`), in any directory.
export function isConfigFile(fsPath: string): boolean {
  const name = path.basename(fsPath);
  return name.endsWith(".hephconfig") || name.endsWith(".hephconfig2");
}

const CONFIG_GLOB = "**/{.hephconfig,.hephconfig2,*.hephconfig,*.hephconfig2}";

interface YamlExtensionAPI {
  registerContributor(
    schema: string,
    requestSchema: (resource: string) => string | undefined,
    requestSchemaContent: (uri: string) => Promise<string> | string,
    label?: string
  ): boolean;
}

interface Entry {
  // Bumped when the schema content changes, so yaml-language-server, which
  // caches content per schema URI, sees a new URI and fetches it again.
  generation: number;
  content: Promise<string>;
}

export class ConfigSchemaProvider implements vscode.Disposable {
  // Keyed by the directory the config file is in: that is the workspace root
  // whose pin decides which heph prints the schema.
  private readonly entries = new Map<string, Entry>();
  private readonly disposables: vscode.Disposable[] = [];

  constructor(private readonly output: vscode.OutputChannel) {}

  async register(context: vscode.ExtensionContext): Promise<void> {
    const ext = vscode.extensions.getExtension<YamlExtensionAPI>(YAML_EXTENSION_ID);
    if (!ext) {
      this.output.appendLine(
        `heph: ${YAML_EXTENSION_ID} is not installed, .hephconfig completion is disabled`
      );
      void this.suggestYamlExtension(context);
      return;
    }

    const api = await ext.activate();
    if (typeof api?.registerContributor !== "function") {
      this.output.appendLine(
        `heph: ${YAML_EXTENSION_ID} does not expose registerContributor, .hephconfig completion is disabled`
      );
      return;
    }

    api.registerContributor(
      SCHEME,
      (resource) => this.requestSchema(resource),
      (uri) => this.requestSchemaContent(uri)
    );

    // The pin lives in the config: a save may move it to a heph with another
    // schema. A changed `heph.bin1` is another binary altogether.
    const watcher = vscode.workspace.createFileSystemWatcher(CONFIG_GLOB);
    this.disposables.push(
      watcher,
      watcher.onDidChange((uri) => this.refresh(path.dirname(uri.fsPath))),
      watcher.onDidCreate((uri) => this.refresh(path.dirname(uri.fsPath))),
      vscode.workspace.onDidChangeConfiguration((e) => {
        if (e.affectsConfiguration("heph.bin1")) {
          for (const dir of this.entries.keys()) {
            this.refresh(dir);
          }
        }
      })
    );
  }

  private requestSchema(resource: string): string | undefined {
    const uri = vscode.Uri.parse(resource);
    if (uri.scheme !== "file" || !isConfigFile(uri.fsPath)) {
      return undefined;
    }

    const dir = path.dirname(uri.fsPath);
    let entry = this.entries.get(dir);
    if (!entry) {
      entry = { generation: 0, content: this.fetch(dir) };
      this.entries.set(dir, entry);
    }

    return vscode.Uri.from({
      scheme: SCHEME,
      path: "/hephconfig.schema.json",
      query: new URLSearchParams({
        dir,
        generation: String(entry.generation),
      }).toString(),
    }).toString();
  }

  private requestSchemaContent(schemaUri: string): Promise<string> | string {
    const dir = new URLSearchParams(vscode.Uri.parse(schemaUri).query).get("dir");
    const entry = dir ? this.entries.get(dir) : undefined;
    return entry?.content ?? EMPTY_SCHEMA;
  }

  // Runs the command again and, only when its output differs, bumps the
  // generation so yaml-language-server picks the new schema up on its next
  // validation. Saves that leave the pin alone thus cost one cheap command and
  // no reload.
  private refresh(dir: string): void {
    const entry = this.entries.get(dir);
    if (!entry) {
      return;
    }

    const next = this.fetch(dir);
    void Promise.all([entry.content, next]).then(([prev, content]) => {
      if (content !== prev && this.entries.get(dir) === entry) {
        this.entries.set(dir, { generation: entry.generation + 1, content: next });
      }
    });
  }

  // Never rejects: a failure is logged and yields the empty schema, without a
  // retry until the config or `heph.bin1` changes.
  private fetch(dir: string): Promise<string> {
    const command = bin();
    return new Promise((resolve) => {
      execFile(
        command,
        ["tool", "config-schema"],
        { cwd: dir, timeout: TIMEOUT_MS, maxBuffer: 16 * 1024 * 1024 },
        (err, stdout, stderr) => {
          const fail = (reason: string) => {
            this.output.appendLine(
              `heph: no .hephconfig schema for ${dir}: \`${command} tool config-schema\` ${reason}`
            );
            if (stderr.trim()) {
              this.output.appendLine(stderr.trimEnd());
            }
            resolve(EMPTY_SCHEMA);
          };

          if (err) {
            fail(err.killed ? `timed out after ${TIMEOUT_MS / 1000}s` : `failed: ${err.message}`);
            return;
          }

          let parsed: unknown;
          try {
            parsed = JSON.parse(stdout);
          } catch {
            fail("did not print JSON");
            return;
          }
          if (typeof parsed !== "object" || parsed === null || !("$schema" in parsed)) {
            fail("printed JSON without a $schema key");
            return;
          }

          resolve(stdout);
        }
      );
    });
  }

  private async suggestYamlExtension(context: vscode.ExtensionContext): Promise<void> {
    if (context.globalState.get<boolean>(DONT_ASK_YAML_KEY)) {
      return;
    }
    const install = "Install";
    const dontAsk = "Don't Ask Again";
    const choice = await vscode.window.showInformationMessage(
      "heph: install the YAML extension (Red Hat) for completion and validation in .hephconfig files.",
      install,
      dontAsk
    );
    if (choice === install) {
      await vscode.commands.executeCommand("workbench.extensions.installExtension", YAML_EXTENSION_ID);
      const reload = "Reload Window";
      const after = await vscode.window.showInformationMessage(
        "heph: reload the window to enable .hephconfig completion.",
        reload
      );
      if (after === reload) {
        await vscode.commands.executeCommand("workbench.action.reloadWindow");
      }
    } else if (choice === dontAsk) {
      await context.globalState.update(DONT_ASK_YAML_KEY, true);
    }
  }

  dispose(): void {
    for (const d of this.disposables) {
      d.dispose();
    }
  }
}
