// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from "vscode";
import * as heph from "./command";
import path = require("path");

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
  // Use the console to output diagnostic information (console.log) and errors (console.error)
  // This line of code will only be executed once when your extension is activated
  console.log('Congratulations, your extension "heph-vscode" is now active!');

  // The command has been defined in the package.json file
  // Now provide the implementation of the command with registerCommand
  // The commandId parameter must match the command field in package.json
  let disposable = vscode.commands.registerCommand("heph.format", () => {
    // The code you place here will be executed every time your command is executed
    // Display a message box to the user
    vscode.window.showInformationMessage("This should format");
  });

  context.subscriptions.push(disposable);

  disposable = vscode.languages.registerDocumentFormattingEditProvider("hephbuild", {
    async provideDocumentFormattingEdits(
      document: vscode.TextDocument
    ): Promise<vscode.TextEdit[] | undefined> {
      console.log("fmt", document.uri.path);

      let firstLine = document.lineAt(0);
      let lastLine = document.lineAt(document.lineCount - 1);
      let textRange = new vscode.Range(
        firstLine.range.start,
        lastLine.range.end
      );

      try {
        const res = await heph.fmt(
          path.dirname(document.uri.path),
          document.getText()
        );
        console.debug("fmt result", res);

        return [vscode.TextEdit.replace(textRange, res)];
      } catch (err) {
		console.error("fmt error", err);

        await vscode.window.showErrorMessage(`fmt failed: ${err}`);
      }
    },
  });

  context.subscriptions.push(disposable);
}

// This method is called when your extension is deactivated
export function deactivate() {}
