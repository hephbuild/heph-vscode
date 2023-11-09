// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from "vscode";
import { TasksProvider } from "./taskprovider";
import { HephBuildDocumentFormatting } from "./documentformatting";
import { FileCodelensProvider } from "./filecodelensprovider";
import { logger } from "./logger";
import { BuildCodelensProvider } from "./buildcodelensprovider";

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
    vscode.commands.registerCommand("heph.copyAddr", async (addrs: string[]) => {
      if (addrs.length > 1) {
        const addr = await vscode.window.showQuickPick(addrs.map(a => `copy ${a}`));
        if (!addr) {
          return
        }
        await vscode.env.clipboard.writeText(addr);
      } else {
        await vscode.env.clipboard.writeText(addrs[0]);
      }
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

  context.subscriptions.push(
    vscode.languages.registerCodeLensProvider(
      "hephbuild",
      new BuildCodelensProvider(invalidateEmitter.event)
    )
  );
  
  context.subscriptions.push(invalidateWatcher("**/BUILD.*", () => {
    invalidateEmitter.fire()
  }));
  context.subscriptions.push(invalidateWatcher("**/*.BUILD", () => {
    invalidateEmitter.fire()
  }));
  context.subscriptions.push(invalidateWatcher("**/BUILD", () => {
    invalidateEmitter.fire()
  }));
}

function invalidateWatcher(pattern: string, f: () => void) {
  const watcher = vscode.workspace.createFileSystemWatcher(pattern)

  watcher.onDidChange(uri => {
    f()
  })
  watcher.onDidCreate(uri => {
    f()
  })
  watcher.onDidDelete(uri => {
    f()
  })


  return watcher;
}

// This method is called when your extension is deactivated
export function deactivate() {}
