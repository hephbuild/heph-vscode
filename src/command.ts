import * as vscode from "vscode";
import { SpawnOptionsWithoutStdio, spawn } from "child_process";
import { Writable } from "stream";

interface ExecOptions extends SpawnOptionsWithoutStdio {
  args: string[];
  stdin?: string;
  cwd?: string;
  token?: vscode.CancellationToken;
}

interface ExecResult {
  stderr: string;
  stdout: string;
  stdcombined: string;
  exitCode: number;
  err?: any;
}

function streamWrite(
  stream: Writable,
  chunk: string | Buffer | Uint8Array,
  encoding: BufferEncoding = "utf8"
): Promise<void> {
  return new Promise((resolve, reject) => {
    const errListener = (err: Error) => {
      stream.removeListener("error", errListener);
      reject(err);
    };
    stream.addListener("error", errListener);
    const callback = () => {
      stream.removeListener("error", errListener);
      resolve(undefined);
    };
    stream.write(chunk, encoding, callback);
  });
}

export default function exec({
  args,
  stdin,
  token,
  ...opts
}: ExecOptions): Promise<ExecResult> {
  const disposables: vscode.Disposable[] = [];

  return new Promise(async function (resolve, reject) {
    console.log("Running", args);

    opts.cwd = opts.cwd ?? vscode.workspace.rootPath!;

    const process = spawn(args[0], args.slice(1), {
      stdio: stdin !== undefined ? ["pipe"] : undefined,
      ...opts,
    });

    if (token) {
      disposables.push(
        token.onCancellationRequested(() => {
          process.kill("SIGINT");

          // Force kill after 5 seconds
          const t = setTimeout(() => {
            process.kill("SIGKILL");
          }, 5 * 1000);

          disposables.push(
            new vscode.Disposable(() => {
              clearTimeout(t);
            })
          );
        })
      );
    }

    if (stdin) {
      await streamWrite(process.stdin, stdin);
      process.stdin.end();
    }

    let stdout = "";
    let stderr = "";
    let stdcombined = "";

    process.stdout.on("data", (data) => {
      stdout += data;
      stdcombined += data;
    });

    process.stderr.on("data", (data) => {
      stderr += data;
      stdcombined += data;
    });

    process.on("close", function (code) {
      disposables.forEach((d) => {
        d.dispose();
      });

      resolve({ stdout, stderr, stdcombined, exitCode: code ?? -1 });
    });
    process.on("error", function (err) {
      disposables.forEach((d) => {
        d.dispose();
      });

      reject({ stdout, stderr, stdcombined, exitCode: -1, err });
    });
  });
}

const bin = "heph";

async function heph(opts: ExecOptions): Promise<ExecResult> {
  return await exec({
    ...opts,
    args: [bin, ...opts.args],
  });
}

export async function fmt(cwd: string, text: string): Promise<string> {
  const { exitCode, stdout, stderr } = await heph({
    args: ["fmt", "-"],
    stdin: text,
    cwd: cwd,
  });
  if (exitCode === 0) {
    return stdout;
  }

  throw new Error(stderr);
}

export interface QueryTarget {
  Addr: string;
  Annotations: Record<string, any>;
  Package: {
    Root: {
      Root: string;
    };
  };
}

export async function query(query: string): Promise<QueryTarget[]> {
  const { exitCode, stdout, stderr } = await heph({
    args: ["query", "--json", query],
  });
  if (exitCode === 0) {
    return JSON.parse(stdout);
  }

  throw new Error(stderr);
}
