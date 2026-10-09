import { constants } from "node:fs";
import { access, stat } from "node:fs/promises";
import { delimiter, join } from "node:path";
import { run } from "@agnostic/core";

const VERSION_PATTERN = /\d+\.\d+(?:\.\d+)?/;

/** The first executable with one of these names in PATH order; a name is never a path itself. */
export async function findOnPath(names: string[], pathVar: string): Promise<string | null> {
  for (const dir of pathVar.split(delimiter)) {
    if (dir.length === 0) {
      continue;
    }
    for (const name of names) {
      const candidate = join(dir, name);
      if (await isExecutableFile(candidate)) {
        return candidate;
      }
    }
  }
  return null;
}

/** `<path> --version`, reduced to the first version number anywhere in its output. */
export async function readVersion(path: string, timeoutMs: number): Promise<string | null> {
  try {
    const { stdout, stderr } = await run(path, ["--version"], { timeoutMs });
    return VERSION_PATTERN.exec(`${stdout}\n${stderr}`)?.[0] ?? null;
  } catch {
    // A harness that cannot say its version is still installed; the version is what we lose.
    return null;
  }
}

async function isExecutableFile(path: string): Promise<boolean> {
  try {
    const stats = await stat(path);
    if (!stats.isFile()) {
      return false;
    }
    await access(path, constants.X_OK);
    return true;
  } catch {
    // A path agn cannot stat or execute is not a harness binary, whatever the reason.
    return false;
  }
}
