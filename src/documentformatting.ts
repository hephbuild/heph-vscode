import * as vscode from "vscode";
import * as heph from "./command";
import path = require("path");

export class HephBuildDocumentFormatting
  implements vscode.DocumentFormattingEditProvider
{
  async provideDocumentFormattingEdits(
    document: vscode.TextDocument
  ): Promise<vscode.TextEdit[] | undefined> {
    console.log("fmt", document.uri.fsPath);

    const firstLine = document.lineAt(0);
    const lastLine = document.lineAt(document.lineCount - 1);
    const textRange = new vscode.Range(firstLine.range.start, lastLine.range.end);

    try {
      const res = await heph.fmt(
        path.dirname(document.uri.path),
        document.getText()
      );
      console.debug("fmt result", res);

      return [vscode.TextEdit.replace(textRange, res)];
    } catch (err) {
      console.error("fmt error", err);

      vscode.window.showErrorMessage(`fmt failed: ${err}`);
    }
  }
}
