import * as vscode from "vscode";
import fs = require("fs");
import path = require("path");

// The binary v1 runs: the `heph.bin1` setting, else `heph` on PATH. v0 reads
// `heph.bin` instead, so both heph generations can coexist.
//
// Temporary hack, intentionally undocumented (not in the setting description,
// README or CLAUDE.md): before `heph`, a `heph1` on PATH is preferred. Remove
// once heph1 no longer needs to be installed under that name.
export function bin(): string {
  return resolveBin(
    vscode.workspace.getConfiguration("heph").get<string>("bin1"),
    process.env.PATH,
    process.platform,
    process.env.PATHEXT
  );
}

export function resolveBin(
  setting: string | undefined,
  pathEnv: string | undefined,
  platform: NodeJS.Platform,
  pathExt: string | undefined
): string {
  if (setting) {
    return setting;
  }
  if (findOnPath("heph1", pathEnv, platform, pathExt)) {
    return "heph1";
  }
  // Even when `heph` is not on PATH either: spawning it then fails with
  // ENOENT, which callers already report.
  return "heph";
}

function findOnPath(
  name: string,
  pathEnv: string | undefined,
  platform: NodeJS.Platform,
  pathExt: string | undefined
): string | undefined {
  const win = platform === "win32";
  const exts = win ? (pathExt || ".COM;.EXE;.BAT;.CMD").split(";").filter(Boolean) : [""];
  for (const dir of (pathEnv ?? "").split(win ? ";" : ":")) {
    if (!dir) {
      continue;
    }
    for (const ext of exts) {
      const candidate = path.join(dir, name + ext);
      if (isExecutableFile(candidate, win)) {
        return candidate;
      }
    }
  }
  return undefined;
}

function isExecutableFile(p: string, win: boolean): boolean {
  try {
    if (!fs.statSync(p).isFile()) {
      return false;
    }
    if (!win) {
      fs.accessSync(p, fs.constants.X_OK);
    }
    return true;
  } catch {
    return false;
  }
}
