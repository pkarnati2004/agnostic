import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { newId, type Repo, run, type Task } from "@agnostic/core";

/** A repo the tests own: one commit on `main` unless the caller wants the empty-repo case. */
export async function createGitRepo(opts: { commits?: boolean } = {}): Promise<Repo> {
  const path = await mkdtemp(join(tmpdir(), "agn-executor-repo-"));
  await git(path, ["init", "-q", "-b", "main"]);
  if (opts.commits !== false) {
    await writeFile(join(path, "README.md"), "# fixture\n");
    await git(path, ["add", "README.md"]);
    await git(path, ["commit", "-q", "-m", "first"]);
  }
  return repoRecord(path, "git");
}

export async function createFolderRepo(): Promise<Repo> {
  return repoRecord(await mkdtemp(join(tmpdir(), "agn-executor-folder-")), "folder");
}

export function testTask(repo: Repo, overrides: Partial<Task> = {}): Task {
  const now = "2026-09-11T10:00:00.000Z";
  return {
    id: newId(),
    repoId: repo.id,
    title: "Add a --verbose flag to the CLI!",
    prompt: "Add a --verbose flag.",
    profileId: "claude-code:sonnet-4.5:native",
    worktreePath: null,
    branch: null,
    status: "queued",
    origin: "agn",
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function repoRecord(path: string, kind: Repo["kind"]): Repo {
  return {
    // A fresh id per repo: two tests must never share a worktree path under the same home.
    id: newId(),
    path,
    kind,
    name: path.split("/").at(-1) ?? "fixture",
    addedAt: "2026-09-11T10:00:00.000Z",
  };
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
