import { SpawnOptionsWithoutStdio, spawn } from "child_process";
import { Writable } from "stream";

interface ExecOptions extends SpawnOptionsWithoutStdio {
  args: string[];
  stdin?: string;
  cwd: string;
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
  ...opts
}: ExecOptions): Promise<ExecResult> {
  return new Promise(async function (resolve, reject) {
    const process = spawn(args[0], args.slice(1), {
      stdio: stdin !== undefined ? ["pipe"] : undefined,
      ...opts,
    });

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
      resolve({ stdout, stderr, stdcombined, exitCode: code ?? -1 });
    });
    process.on("error", function (err) {
      reject({ stdout, stderr, stdcombined, exitCode: -1, err });
    });
  });
}

async function heph(opts: ExecOptions): Promise<ExecResult> {
  return await exec({
    ...opts,
    args: ["heph", ...opts.args],
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
