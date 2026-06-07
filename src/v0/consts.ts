import * as vscode from "vscode";

class SettingItem<T> {
    readonly key: string;

    constructor(key: string) {
        this.key = key
    }

    get(): T {
        return vscode.workspace.getConfiguration("heph").get(this.key) as T;
    }
}

export class Settings {
    static fileWatcher = new SettingItem<boolean>("buildfiles.watcher.enabled")
    static copyAddrCodelens = new SettingItem<boolean>("buildfiles.copyAddr.codelens")
    static copyAddrGen = new SettingItem<boolean>("buildfiles.copyAddr.gen")
    static copyAddrShowAll = new SettingItem<boolean>("buildfiles.copyAddr.showAll")
    static fileRunCodelens = new SettingItem<boolean>("fileRun.codelens")
    static fileRunGen = new SettingItem<boolean>("fileRun.gen")
    static bin = new SettingItem<string>("bin")
}

export class Commands {
    static refreshState = "heph.refreshState"
    static runTarget = "heph.runTarget"
    static editorRunConfigs = "heph.editorRunConfigs"
    static copyAddr = "heph.copyAddr"
    static launchTarget = "heph.launchTarget"
}