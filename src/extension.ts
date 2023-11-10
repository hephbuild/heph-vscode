import * as vscode from "vscode";
import { TasksProvider } from "./taskprovider";
import { HephBuildDocumentFormatting } from "./documentformatting";
import { logger } from "./logger";
import { BuildCodelensProvider } from "./buildcodelensprovider";
import FileRunProvider from "./filerunprovider";
import EditorExt from "./editorext";
import { Commands, Settings } from "./consts";
import InFlight from "./inflight";
import StatusBar from "./statusbar";

export function activate(context: vscode.ExtensionContext) {
  if (context.extensionMode == vscode.ExtensionMode.Development) {
    logger.withConsole(true)
    logger.show()
  }

  logger.info('heph-vscode is now active!');

  const inFlight = new InFlight()

  const invalidateEmitter = new vscode.EventEmitter<void>();
  context.subscriptions.push(invalidateEmitter);
  
  context.subscriptions.push(
    vscode.commands.registerCommand(Commands.refreshState, async () => {
      invalidateEmitter.fire();
    })
  );

  const fileRunProvider = new FileRunProvider(invalidateEmitter.event, inFlight)

  const editorExt = new EditorExt(fileRunProvider)

  const statusBarItem = new StatusBar(inFlight);

  context.subscriptions.push(statusBarItem);

  const taskProvider = new TasksProvider(fileRunProvider.onDidChange);

  context.subscriptions.push(
    vscode.commands.registerCommand(Commands.runTarget, async (addr: string) => {
      vscode.tasks.executeTask(taskProvider.getTask(addr));
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(Commands.editorRunConfigs, async () => {
      const configs = editorExt.editorConfigs;

      if (configs.length === 0) {
        return
      } 

      if (configs.length === 1) {
        const cfg = configs[0];

        await vscode.commands.executeCommand(cfg.command, ...cfg.arguments)
      } else {
        const res = await vscode.window.showQuickPick(configs.map(cfg => (<vscode.QuickPickItem & {config: typeof cfg}>{
          label: cfg.title,
          config: cfg,
        })));
        if (!res) {
          return
        }
        await vscode.commands.executeCommand(res.config.command, ...res.config.arguments)
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(Commands.copyAddr, async (addrs: string[]) => {
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
      Commands.launchTarget,
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
      "hephbuild",
      new BuildCodelensProvider(fileRunProvider.onDidChange, inFlight)
    )
  );

  function buildFileOnDidChange() {
    if (!Settings.fileWatcher.get()) {
      return;
    }

    invalidateEmitter.fire()
  }
  
  context.subscriptions.push(patternFSWatcher("**/BUILD.*", buildFileOnDidChange));
  context.subscriptions.push(patternFSWatcher("**/*.BUILD", buildFileOnDidChange));
  context.subscriptions.push(patternFSWatcher("**/BUILD", buildFileOnDidChange));
}

function patternFSWatcher(pattern: string, f: () => void) {
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
