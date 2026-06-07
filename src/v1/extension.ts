import * as vscode from "vscode";

export function activate(context: vscode.ExtensionContext) {
  console.log("heph-vscode (v1) is now active!");

  context.subscriptions.push(
    vscode.commands.registerCommand("heph.v1.hello", async () => {
      await vscode.window.showInformationMessage("Hello from heph v1!");
    })
  );
}
