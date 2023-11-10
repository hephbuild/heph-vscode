import * as vscode from "vscode";
import FileRunProvider from "./filerunprovider";
import { Commands, Settings } from "./consts";

interface EditorAction {
    title: string;
    tooltip?: string;
    command: string;
    arguments: any[];
}

export default class EditorExt {
    private fileRunProvider: FileRunProvider;
    editorConfigs: EditorAction[] = []

    constructor(fileRunProvider: FileRunProvider) {
        this.fileRunProvider = fileRunProvider

        this.fileRunProvider.onDidChange(() => {
            const editor = vscode.window.activeTextEditor;
            if (!editor) {
                return
            }
            void this._ensureState(editor.document.uri);
        })

        vscode.window.onDidChangeActiveTextEditor((textEditor) => {
            if (!textEditor) {
                return;
            }
            void this._ensureState(textEditor.document.uri);
        });
    }

    private setConfigs(configs: EditorAction[]) {
        this.editorConfigs = configs;
        vscode.commands.executeCommand('setContext', 'heph.hasRunConfigs', configs.length > 0);
    }

    private async _ensureState(uri: vscode.Uri) {
        if (!Settings.fileRunCodelens.get()) {
            this.setConfigs([])
            return;
        }
        
        const targets = await this.fileRunProvider.getAnnotationsTargettingFile(uri.fsPath);

        const configs = targets.flatMap((target) => {
            return Object.entries(target.Annotations).flatMap(([k, annotation]): EditorAction[] => {
                switch (k) {
                    case FileRunProvider.annotationLaunch:
                        if (!annotation.configuration) {
                            return [];
                        }

                        return [
                            {
                                title: annotation.configuration.name ?? target.Addr,
                                tooltip: `Launch config:\n\n${JSON.stringify(
                                    annotation.configuration,
                                    null,
                                    "    "
                                )}`,
                                command: Commands.launchTarget,
                                arguments: [annotation.configuration],
                            }
                        ]
                    case FileRunProvider.annotationTask:
                        return [
                            {
                                title: target.Addr,
                                command: Commands.runTarget,
                                arguments: [target.Addr],
                            }
                        ]
                }

                return [];
            });
        });

        this.setConfigs(configs);
    }
}