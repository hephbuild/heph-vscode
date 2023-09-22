// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from "vscode";
import { TasksProvider } from "./taskprovider";
import { HephBuildDocumentFormatting } from "./documentformatting";
import { FileCodelensProvider } from "./filecodelensprovider";
import { logger } from "./logger";

export function activate(context: vscode.ExtensionContext) {
  if (context.extensionMode == vscode.ExtensionMode.Development) {
    logger.withConsole(true)
    logger.show()
  }

  logger.info('heph-vscode is now active!');

  const invalidateEmitter = new vscode.EventEmitter<void>();
  context.subscriptions.push(invalidateEmitter);

  const taskProvider = new TasksProvider(invalidateEmitter.event);

  context.subscriptions.push(
    vscode.commands.registerCommand("heph.refreshState", async () => {
      invalidateEmitter.fire();
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("heph.runTarget", async (addr: string) => {
      vscode.tasks.executeTask(taskProvider.getTask(addr));
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      "heph.launchTarget",
      async (config: vscode.DebugConfiguration) => {
        vscode.debug.startDebugging(
          (vscode.workspace.workspaceFolders ?? [])[0],
          config
        );
      }
    )
  );

  context.subscriptions.push(
    vscode.languages.registerDocumentFormattingEditProvider(
      "hephbuild",
      new HephBuildDocumentFormatting()
    )
  );

  context.subscriptions.push(
    vscode.tasks.registerTaskProvider("heph", taskProvider)
  );

  context.subscriptions.push(
    vscode.languages.registerCodeLensProvider(
      "*",
      new FileCodelensProvider(invalidateEmitter.event)
    )
  );
}

// This method is called when your extension is deactivated
export function deactivate() {}
