import * as vscode from "vscode";

// v1 has its own binary setting (`heph.bin1`), separate from v0's `heph.bin`,
// so both heph generations can be installed side by side.
export function bin(): string {
  return vscode.workspace.getConfiguration("heph").get<string>("bin1") || "heph";
}
