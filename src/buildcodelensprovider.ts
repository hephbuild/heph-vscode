import * as vscode from "vscode";
import * as heph from "./command";
import { logger } from "./logger";
import { Commands, Settings } from "./consts";
import InFlight from "./inflight";

export class BuildCodelensProvider implements vscode.CodeLensProvider {
  private onDidChange: vscode.EventEmitter<void>;
  onDidChangeCodeLenses: vscode.Event<void>;

  private queryPromise: Promise<heph.QueryTarget[]> | undefined;
  private didShowPromiseError = false;
  private inFlight: InFlight;

  constructor(onInvalidate: vscode.Event<void>, inFlight: InFlight) {
    this.inFlight = inFlight;
    this.onDidChange = new vscode.EventEmitter();
    this.onDidChangeCodeLenses = this.onDidChange.event;

    onInvalidate(() => {
      this.queryPromise = undefined;
      this.didShowPromiseError = false;
      this.onDidChange.fire();
    });
  }

  private getPos(target: heph.QueryTarget, file: string) {
    for (const s of target.Sources) {
      for (const cf of s.CallFrames) {
        if (cf.Pos.File === file) {
          return cf.Pos
        }
      }
    }

    return undefined
  }

  private async getTargetsPresentOnFile(file: string) {
    if (!this.queryPromise) {
      this.queryPromise = this.inFlight.watch(heph.query(":", "--no-gen"))
    }

    let targets: heph.QueryTarget[];
    try {
      targets = await this.queryPromise;
      this.didShowPromiseError = false;
    } catch (err) {
      if (!this.didShowPromiseError) {
        logger.error("get all error", err);

        vscode.window.showErrorMessage(`get all failed: ${err}`);
        this.didShowPromiseError = true;
      }

      return [];
    }

    return targets.filter((t) => {
      return this.getPos(t, file)
    });
  }

  public async provideCodeLenses(
    document: vscode.TextDocument,
    token: vscode.CancellationToken
  ): Promise<vscode.CodeLens[]> {
    if (!Settings.copyAddrCodelens.get()) {
      return [];
    }

    const targets = await this.getTargetsPresentOnFile(document.fileName);
    
    const perLine: Record<number, string[]> = {}
    for (const target of targets) {
      const pos = this.getPos(target, document.fileName)!;
      const line = pos.Line > 0 ? pos.Line - 1 : 0;
      if (!perLine[line]) {
        perLine[line] = []
      }
      perLine[line].push(target.Addr)
    }

    return Object.entries(perLine).map(([linen, addrs]) => {
      const line = document.lineAt(parseInt(linen));
      const range = new vscode.Range(line.range.start, line.range.end);

      return new vscode.CodeLens(range, {
        title: addrs.length === 1 ? `copy addr` : `copy addr (${addrs.length})`,
        command: Commands.copyAddr,
        arguments: [addrs],
      })
    })
  }

  public resolveCodeLens(
    codeLens: vscode.CodeLens,
    token: vscode.CancellationToken
  ) {
    return codeLens;
  }
}
