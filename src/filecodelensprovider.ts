import * as vscode from "vscode";
import * as heph from "./command";
import path = require("path");
import { logger } from "./logger";

const annotationTask = "vscode-task";
const annotationLaunch = "vscode-launch";

export class FileCodelensProvider implements vscode.CodeLensProvider {
  private onDidChange: vscode.EventEmitter<void>;
  onDidChangeCodeLenses: vscode.Event<void>;

  private queryPromise: Promise<heph.QueryTarget[]> | undefined;
  private didShowPromiseError = false;

  constructor(onInvalidate: vscode.Event<void>) {
    this.onDidChange = new vscode.EventEmitter();
    this.onDidChangeCodeLenses = this.onDidChange.event;

    onInvalidate(() => {
      this.queryPromise = undefined;
      this.didShowPromiseError = false;
      this.onDidChange.fire();
    });
  }

  private async getAnnotationsTargettingFile(file: string) {
    if (!this.queryPromise) {
      this.queryPromise = heph.query(
        `has_annotation("${annotationTask}") || has_annotation("${annotationLaunch}")`
      );
    }

    let targets: heph.QueryTarget[];
    try {
      targets = await this.queryPromise;
      this.didShowPromiseError = false;
    } catch (err) {
      if (!this.didShowPromiseError) {
        logger.error("annotations error", err);

        vscode.window.showErrorMessage(`get annotations failed: ${err}`);
        this.didShowPromiseError = true;
      }

      return [];
    }

    return targets.filter((t) => {
      return Object.entries(t.Annotations).some(([k, a]) => {
        if (![annotationTask, annotationLaunch].includes(k)) {
          return false;
        }

        if (!a.file) {
          return false;
        }

        if (path.isAbsolute(a.file)) {
          if (a.file === file) {
            return true;
          }
        }

        if (path.join(t.Package.Root.Abs, a.file) === file) {
          return true;
        }

        return false;
      });
    });
  }

  public async provideCodeLenses(
    document: vscode.TextDocument,
    token: vscode.CancellationToken
  ): Promise<vscode.CodeLens[]> {
    const config = vscode.workspace.getConfiguration("heph");

    if (!config.get("codelens.enabled")) {
      return [];
    }

    const targets = await this.getAnnotationsTargettingFile(document.fileName);

    const line = document.lineAt(0);
    const range = new vscode.Range(line.range.start, line.range.end);

    return [
      ...this.codelensesFromAnnotations(
        targets,
        annotationLaunch,
        range,
        (target, annotation) => {
          if (!annotation.configuration) {
            return undefined;
          }

          return {
            title: annotation.configuration?.name ?? target.Addr,
            tooltip: `Launch config:\n\n${JSON.stringify(
              annotation.configuration,
              null,
              "    "
            )}`,
            command: "heph.launchTarget",
            arguments: [annotation.configuration],
          };
        }
      ),
      ...this.codelensesFromAnnotations(
        targets,
        annotationTask,
        range,
        (target, annotation) => {
          return {
            title: target.Addr,
            command: "heph.runTarget",
            arguments: [target.Addr],
          };
        }
      ),
    ];
  }

  private codelensesFromAnnotations(
    targets: heph.QueryTarget[],
    annotation: string,
    range: vscode.Range,
    f: (
      target: heph.QueryTarget,
      annotation: any
    ) => vscode.Command | vscode.Command[] | undefined
  ) {
    return targets.flatMap((target) => {
      return Object.entries(target.Annotations).flatMap(([k, a]) => {
        if (k !== annotation) {
          return [];
        }

        let commands = f(target, a);
        if (!commands) {
          return [];
        }

        if (!Array.isArray(commands)) {
          commands = [commands];
        }

        return commands.map((command) => new vscode.CodeLens(range, command));
      });
    });
  }

  public resolveCodeLens(
    codeLens: vscode.CodeLens,
    token: vscode.CancellationToken
  ) {
    return codeLens;
  }
}
