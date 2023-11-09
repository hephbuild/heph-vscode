import * as vscode from "vscode";
import { SpawnOptionsWithoutStdio, spawn } from "child_process";
import { Writable } from "stream";
import { logger } from "./logger";

interface ExecOptions extends SpawnOptionsWithoutStdio {
  args: string[];
  stdin?: string;
  cwd?: string;
  token?: vscode.CancellationToken;
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

interface ExecResultI {
  stderr: string;
  stdout: string;
  stdcombined: string;
  exitCode: number;
  err?: any;
}

class ExecResult implements ExecResultI {
  constructor(
    public stdout: string,
    public stderr: string,
    public stdcombined: string,
    public exitCode: number,
    public err?: any,
  ){}
}

class ExecResultError extends Error implements ExecResultI {
  constructor(
    public stderr: string,
    public stdout: string,
    public stdcombined: string,
    public exitCode: number,
    public err?: any,
  ){
    super(err)
  }
}

export default function exec({
  args,
  stdin,
  token,
  ...opts
}: ExecOptions): Promise<ExecResult> {
  const disposables: vscode.Disposable[] = [];

  return new Promise(async function (resolve, reject) {
    logger.info("Running", args);

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

      resolve(new ExecResult(stdout, stderr, stdcombined, code ?? -1))
    });
    process.on("error", function (err) {
      disposables.forEach((d) => {
        d.dispose();
      });

      reject(new ExecResultError(stdout, stderr, stdcombined, -1, err))
    });
  });
}

async function heph(opts: ExecOptions): Promise<ExecResult> {
  const config = vscode.workspace.getConfiguration('heph')

  const bin = config.get<string>('bin') || "heph";

  return await exec({
    ...opts,
    args: [bin, ...opts.args],
  });
}

export async function fmt(cwd: string, text: string): Promise<string> {
  const { exitCode, stdout, stdcombined } = await heph({
    args: ["fmt", "-"],
    stdin: text,
    cwd: cwd,
  });
  if (exitCode === 0) {
    return stdout;
  }

  throw new Error(stdcombined);
}

export interface QueryTarget {
  Addr: string;
  Annotations: Record<string, any>;
  Package: {
    Root: {
      Root: string;
      RelRoot: string;
      Abs: string;
    };
  };
  Sources: {
    CallFrames: {
      Name: string;
      Pos: {
        File: string;
        Line: number;
      }
    }[]
  }[]
}

export async function query(query: string): Promise<QueryTarget[]> {
  const { exitCode, stdout, stdcombined } = await heph({
    args: ["query", "--json", query],
  });
  if (exitCode === 0) {
    return JSON.parse(stdout);
  }

  throw new Error(stdcombined);
}
