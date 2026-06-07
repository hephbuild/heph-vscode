import * as vscode from "vscode";
import { activate as activateV0 } from "./v0/extension";
import { activate as activateV1 } from "./v1/extension";

type Mode = "v0" | "v1";

function getMode(): Mode {
  return vscode.workspace.getConfiguration("heph").get<Mode>("mode") ?? "v0";
}

export function activate(context: vscode.ExtensionContext) {
  const activeMode = getMode();

  vscode.commands.executeCommand("setContext", "heph.mode", activeMode);

  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration(async (e) => {
      if (!e.affectsConfiguration("heph.mode")) {
        return;
      }
      if (getMode() === activeMode) {
        return;
      }
      const reload = "Reload Window";
      const choice = await vscode.window.showInformationMessage(
        "heph mode changed. Reload window to apply.",
        reload
      );
      if (choice === reload) {
        await vscode.commands.executeCommand("workbench.action.reloadWindow");
      }
    })
  );

  switch (activeMode) {
    case "v1":
      activateV1(context);
      break;
    case "v0":
    default:
      activateV0(context);
      break;
  }
}

// This method is called when your extension is deactivated
export function deactivate() {}
