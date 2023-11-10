import * as vscode from "vscode";

export function isPromise<R>(val: R | Promise<R>): val is Promise<R> {
    return val && (<Promise<R>>val).then !== undefined;
}

export default class InFlight {
    private count = 0;
   
    private didChange = new vscode.EventEmitter<boolean>();
    onDidChange: vscode.Event<boolean>;

    constructor() {
        this.onDidChange = this.didChange.event;
    }

    watch<R>(f: () => R): R {
        this.count++;
        this.didChange.fire(true);

        const r = f();

        if (isPromise(r)) {
            r.finally(() => {
                this.handleDone()
            })
            return r
        } else {
            this.handleDone()
        }
        
        return r
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
