import * as vscode from "vscode";

export default class InFlight {
    private count = 0;
   
    private didChange = new vscode.EventEmitter<boolean>();
    onDidChange: vscode.Event<boolean>;

    constructor() {
        this.onDidChange = this.didChange.event;
    }

    watch<R>(p: Promise<R>): Promise<R> {
        this.count++;
        this.didChange.fire(true);

        return p.finally(() => {
            this.handleDone()
        })
    }

    private handleDone() {
        this.count--;
        if (this.count === 0) {
            this.didChange.fire(false);
        }
    }

    has() {
        return this.count > 0;
    }
}
