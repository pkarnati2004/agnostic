import { chmod, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * A `git` ahead of the real one on PATH that fails the way a lock or a broken install does: exit
 * 128 by default, with something on stderr, which is never the ref being absent. A caller probing
 * the boundary in `branch-verdict.ts` may pass another exit code, such as the 1 a real
 * `rev-parse --verify` also uses for an unrelated failure. Returns the undo.
 */
export async function shimGit(stderr: string, exitCode = 128): Promise<() => void> {
  const dir = await mkdtemp(join(tmpdir(), "agn-git-shim-"));
  const shim = join(dir, "git");
  // The message goes to a file the shim cats, so a `$` or a backtick in it is never shell syntax.
  const message = join(dir, "stderr.txt");
  await writeFile(message, `${stderr}\n`, "utf8");
  await writeFile(shim, `#!/bin/sh\ncat ${quote(message)} >&2\nexit ${exitCode}\n`, "utf8");
  await chmod(shim, 0o755);
  const original = process.env.PATH ?? "";
  process.env.PATH = `${dir}:${original}`;
  return () => {
    process.env.PATH = original;
  };
}

function quote(value: string): string {
  return `'${value.replaceAll("'", `'\\''`)}'`;
}
