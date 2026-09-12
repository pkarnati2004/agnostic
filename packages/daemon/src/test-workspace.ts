import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { defaultRepoConfig, newId, run, writeRepoConfig } from "@agnostic/core";

export type TestRepoOptions = { git?: boolean; defaultProfile?: string };

/** A workspace on disk the test registers through the API, the way `agn add` does. */
export async function createWorkspace(opts: TestRepoOptions): Promise<string> {
  const path = await mkdtemp(join(tmpdir(), "agn-repo-"));
  if (opts.git !== false) {
    await git(path, ["init", "-q", "-b", "main"]);
    await writeFile(join(path, "README.md"), "# fixture\n");
    await git(path, ["add", "README.md"]);
    await git(path, ["commit", "-q", "-m", "first"]);
  }
  if (opts.defaultProfile !== undefined) {
    await writeRepoConfig(path, {
      ...defaultRepoConfig(newId()),
      defaultProfileId: opts.defaultProfile,
    });
  }
  return path;
}

function git(path: string, args: string[]): Promise<unknown> {
  return run("git", [
    "-C",
    path,
    "-c",
    "user.email=t@agn.test",
    "-c",
    "user.name=agn test",
    ...args,
  ]);
}
