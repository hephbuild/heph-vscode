import * as vscode from "vscode";
import * as heph from "./command";
import { logger } from "./logger";

// Must be kept in sync with package.json
interface TargetTaskDefinition extends vscode.TaskDefinition {
  addr: string;
  force?: boolean;
}

export class TasksProvider implements vscode.TaskProvider {
  static HephType = "heph";

  private tasksPromise: Promise<vscode.Task[]> | undefined;

  constructor(onInvalidate: vscode.Event<void>) {
    onInvalidate(() => {
      this.tasksPromise = undefined;
    });
  }

  async provideTasks() {
    if (!this.tasksPromise) {
      this.tasksPromise = this.getTasks();
    }

    try {
      return await this.tasksPromise;
    } catch (err) {
      logger.error("tasks error", err);

      vscode.window.showErrorMessage(`get tasks failed: ${err}`);
    }
  }

  resolveTask(_task: vscode.Task): vscode.Task | undefined {
    const addr: string = _task.definition.addr;
    if (addr) {
      const definition: TargetTaskDefinition = <any>_task.definition;
      return this.getTask(definition.addr, definition);
    }
    return undefined;
  }

  public getTask(addr: string, definition?: TargetTaskDefinition): vscode.Task {
    if (definition === undefined) {
      definition = {
        type: TasksProvider.HephType,
        addr,
        force: true,
      };
    }

    const args = ["run", addr];
    if (definition.force) {
      args.push("--force");
    }

    const task = new vscode.Task(
      definition,
      vscode.TaskScope.Workspace,
      definition.addr,
      TasksProvider.HephType,
      new vscode.ProcessExecution(heph.bin(), args)
    );
    task.presentationOptions = {
      reveal: vscode.TaskRevealKind.Always,
      panel: vscode.TaskPanelKind.Dedicated,
      showReuseMessage: false,
      clear: true,
      echo: true,
    };
    task.problemMatchers = [];

    return task;
  }

  private async getTasks(): Promise<vscode.Task[]> {
    const targets = await heph.query(":");

    return targets.map((t) => {
      return this.getTask(t.Addr);
    });
  }
}
