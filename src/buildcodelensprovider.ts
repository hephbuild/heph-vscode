import * as vscode from "vscode";
import * as heph from "./command";
import { logger } from "./logger";
import { Commands, Settings } from "./consts";
import InFlight from "./inflight";
import { LRUCache } from 'lru-cache'
import path = require("path");

interface TargetLocation {
  target: heph.QueryTarget
  pos: heph.QueryTarget["Sources"][0]["CallFrames"][0]["Pos"]
}

export class BuildCodelensProvider implements vscode.CodeLensProvider {
  private onDidChange: vscode.EventEmitter<void>;
  onDidChangeCodeLenses: vscode.Event<void>;

  private didShowPromiseError = false;
  private inFlight: InFlight;

  private _root: Promise<string> | undefined;
  private get root(): Promise<string> {
    return this._root ?? (this._root = this.inFlight.watch(heph.queryRoot()))
  }

  private queryCache = new LRUCache<string, heph.QueryTarget[]>({
    max: 20,
    fetchMethod: async (pkg: string) => {
      let args = ["-a"]
      if (!Settings.copyAddrGen.get()) {
        args.push("--no-gen")
      }

      return this.inFlight.watch(heph.query(`//${pkg}:* || gen_source(//${pkg}:*)`, ...args))
    },
  })

  constructor(onInvalidate: vscode.Event<void>, inFlight: InFlight) {
    this.inFlight = inFlight;
    this.onDidChange = new vscode.EventEmitter();
    this.onDidChangeCodeLenses = this.onDidChange.event;

    vscode.workspace.onDidChangeConfiguration(event => {
      this.onDidChange.fire();
    })

    onInvalidate(() => {
      this._root = undefined;
      this.queryCache.clear();
      this.didShowPromiseError = false;
      this.onDidChange.fire();
    });
  }

  private getPos(target: heph.QueryTarget, file: string) {
    for (const s of target.Sources) {
      const direct = s.CallFrames.length <= 2;

      for (const cf of s.CallFrames) {
        if (cf.Pos.File === file) {
          return {pos: cf.Pos, direct}
        }
      }
    }

    return undefined
  }

  private async pkgFromFile(file: string) {
    const root = await this.root;

    let pkg = path.dirname(file)
    if (pkg.endsWith('/')) {
      pkg = pkg.substring(0, -1)
    }
    pkg = pkg.replace(root, "")
    if (pkg.startsWith('/')) {
      pkg = pkg.substring(1)
    }

    return pkg;
  }

  private async getTargetsPresentOnFile(file: string) {
    const pkg = await this.pkgFromFile(file);

    let targets: heph.QueryTarget[] | undefined = undefined;
    while (targets === undefined) {
      try {
        targets = (await this.queryCache.fetch(pkg))!;
        this.didShowPromiseError = false;
      } catch (err) {
        console.log("ERR", `${err}`)
        if (`${err}` === "Error: deleted") {
          continue
        }

        if (!this.didShowPromiseError) {
          logger.error("get all error", err);

          vscode.window.showErrorMessage(`get all failed: ${err}`);
          this.didShowPromiseError = true;
        }

        return [];
      }
    }

    return targets.flatMap((t): TargetLocation[] => {
      const locations: TargetLocation[] = []

      const pos = this.getPos(t, file);
      if (pos) {
        if (!pos.direct && t.Private && !Settings.copyAddrShowAll.get()) {
          return locations;
        }

        locations.push({
          target: t,
          pos: pos.pos,
        })
      }

      if (t.GenSources) {
        for (const s of t.GenSources) {
          const st = targets!.find(t => t.Addr === s)

          if (st) {
            const pos1 = this.getPos(st, file);
            if (pos1) {
              if (!pos1.direct && t.Private && !Settings.copyAddrShowAll.get()) {
                return locations;
              }

              locations.push({
                target: t,
                pos: pos1.pos,
              })
            }
          }
        }
      }

      return locations
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
    for (const { target, pos } of targets) {
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
