import * as vscode from "vscode";
import InFlight from "./inflight";

export default class StatusBar {
    private item: vscode.StatusBarItem;
    private inFlight: InFlight

    constructor(inFlight: InFlight) {
        this.inFlight = inFlight;
        inFlight.onDidChange(() => {
            this.ensureState()
        })
        this.item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 999);
        this.ensureState()
    }

    private async ensureState() {
        if (this.inFlight.has()) {
            this.item.text = "$(sync~spin) heph"
        } else {
            this.item.text = "$(heph-logo) heph"
        }
        this.item.show()
    }

    dispose() {
        this.item.dispose();
    }
}
