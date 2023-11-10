import * as vscode from "vscode";
import * as heph from "./command";
import path = require("path");
import { logger } from "./logger";

export default class FileRunProvider {
    static annotationTask = "vscode-task";
    static annotationLaunch = "vscode-launch";

    private queryPromise: Promise<heph.QueryTarget[]> | undefined;
    private didShowPromiseError = false;

    private didChange = new vscode.EventEmitter<void>();
    onDidChange: vscode.Event<void>;

    constructor(onInvalidate: vscode.Event<void>) {
        this.onDidChange = this.didChange.event;

        onInvalidate(() => {
            this.queryPromise = undefined;
            this.didShowPromiseError = false;
            this.runQuery()
        });
    }

    private async runQuery() {
        if (!this.queryPromise) {
            this.queryPromise = heph.query(
                `has_annotation("${FileRunProvider.annotationTask}") || has_annotation("${FileRunProvider.annotationLaunch}")`
            );
            this.queryPromise.then(() => {
                this.didChange.fire();
            })
        }

        return this.queryPromise;
    }

    async getAnnotationsTargettingFile(file: string) {
        let targets: heph.QueryTarget[];
        try {
            targets = await this.runQuery();
            this.didShowPromiseError = false;
        } catch (err) {
            if (!this.didShowPromiseError) {
                logger.error("error", err);

                vscode.window.showErrorMessage(`get annotations: ${err}`);
                this.didShowPromiseError = true;
            }

            return [];
        }

        return targets.filter((t) => {
            return Object.entries(t.Annotations).some(([k, a]) => {
                if (![FileRunProvider.annotationTask, FileRunProvider.annotationLaunch].includes(k)) {
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
}