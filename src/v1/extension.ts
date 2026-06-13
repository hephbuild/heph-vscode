import * as vscode from "vscode";
import { HephLanguageClient } from "./lsp";

export function activate(context: vscode.ExtensionContext) {
  console.log("heph-vscode (v1) is now active!");

  const output = vscode.window.createOutputChannel("heph Language Server");
  context.subscriptions.push(output);

  const lsp = new HephLanguageClient(output);
  context.subscriptions.push(
    new vscode.Disposable(() => {
      void lsp.stop();
    })
  );

  // Offers a "Show Log" action that reveals the server output channel where the
  // underlying failure (heph's stderr / crash reason) is logged.
  const reportFailure = async (message: string, err: unknown) => {
    output.appendLine(`${message}: ${err instanceof Error ? err.stack ?? err.message : String(err)}`);
    const showLog = "Show Log";
    const choice = await vscode.window.showErrorMessage(
      err instanceof Error ? err.message : `${message}: ${err}`,
      showLog
    );
    if (choice === showLog) {
      output.show(true);
    }
  };

  void lsp.start().catch((err) => {
    void reportFailure("heph: failed to start language server", err);
  });

  context.subscriptions.push(
    vscode.commands.registerCommand("heph.v1.lsp.restart", async () => {
      try {
        await lsp.restart();
        vscode.window.showInformationMessage("heph: language server restarted");
      } catch (err) {
        await reportFailure("heph: failed to restart language server", err);
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("heph.v1.hello", async () => {
      await vscode.window.showInformationMessage("Hello from heph v1!");
    })
  );
}
