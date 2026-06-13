import * as vscode from "vscode";
import {
  CloseAction,
  ErrorAction,
  ErrorHandler,
  LanguageClient,
  LanguageClientOptions,
  ServerOptions,
} from "vscode-languageclient/node";

// The heph CLI hosts the language server, speaking LSP over stdio:
// `heph tool build-lsp`.
const LSP_ARGS = ["tool", "build-lsp"];

function bin(): string {
  return vscode.workspace.getConfiguration("heph").get<string>("bin") || "heph";
}

export class HephLanguageClient {
  private client: LanguageClient | undefined;
  // Serializes start/stop/restart so a second restart can't race a start that
  // is still tearing down a failed client.
  private pending: Promise<void> = Promise.resolve();

  constructor(private readonly output: vscode.OutputChannel) {}

  // The default error handler restarts the server up to 4 times on crash and
  // force-logs each failure to the extension host. For a server that dies
  // during startup that turns into a noisy retry storm, so opt out entirely:
  // a manual restart is the only retry. `handled: true` stops the client from
  // logging its own error on top of ours.
  private errorHandler(): ErrorHandler {
    return {
      error: () => ({ action: ErrorAction.Shutdown, handled: true }),
      closed: () => ({ action: CloseAction.DoNotRestart, handled: true }),
    };
  }

  private buildClient(): LanguageClient {
    // No `transport` set: the Executable form defaults to communicating over
    // the child's stdio streams without appending a `--stdio` arg to the
    // command. heph speaks LSP over stdio directly.
    const serverOptions: ServerOptions = {
      command: bin(),
      args: LSP_ARGS,
      options: {
        cwd: vscode.workspace.workspaceFolders?.[0]?.uri.fsPath,
      },
    };

    const clientOptions: LanguageClientOptions = {
      documentSelector: [{ language: "hephbuild" }],
      outputChannel: this.output,
      errorHandler: this.errorHandler(),
      // Disable the built-in crash-restart counter; we restart manually only.
      connectionOptions: { maxRestartCount: 0 },
      // Swallow the client's default "initialization failed" popup; we surface
      // our own message with a pointer to the output channel instead.
      initializationFailedHandler: () => false,
      synchronize: {
        fileEvents: vscode.workspace.createFileSystemWatcher("**/BUILD*"),
      },
    };

    return new LanguageClient(
      "hephLsp",
      "heph Language Server",
      serverOptions,
      clientOptions
    );
  }

  start(): Promise<void> {
    return this.enqueue(() => this.doStart());
  }

  stop(): Promise<void> {
    return this.enqueue(() => this.doStop());
  }

  async restart(): Promise<void> {
    return this.enqueue(async () => {
      await this.doStop();
      await this.doStart();
    });
  }

  // Run `fn` after any in-flight start/stop/restart settles, so operations
  // never overlap. Errors propagate to the caller but don't poison the queue.
  private enqueue(fn: () => Promise<void>): Promise<void> {
    const run = this.pending.then(fn, fn);
    this.pending = run.catch(() => undefined);
    return run;
  }

  private async doStart(): Promise<void> {
    if (this.client) {
      return;
    }
    const client = this.buildClient();
    this.client = client;
    try {
      await client.start();
    } catch (err) {
      // A failed start leaves the client in the `startFailed` state, where
      // stop() throws. Drop it so the next start() rebuilds from scratch.
      this.client = undefined;
      await client.dispose().catch(() => undefined);
      throw new LspStartError(err);
    }
  }

  private async doStop(): Promise<void> {
    const client = this.client;
    this.client = undefined;
    if (!client) {
      return;
    }
    // stop() is only valid while starting/running; otherwise dispose to be safe.
    if (client.needsStop()) {
      await client.stop().catch(() => undefined);
    } else {
      await client.dispose().catch(() => undefined);
    }
  }
}

// Wraps the underlying start failure with a stable, user-readable message.
export class LspStartError extends Error {
  constructor(readonly cause: unknown) {
    const detail = cause instanceof Error ? cause.message : String(cause);
    super(
      `heph language server failed to start (\`${bin()} ${LSP_ARGS.join(
        " "
      )}\`): ${detail}`
    );
    this.name = "LspStartError";
  }
}
