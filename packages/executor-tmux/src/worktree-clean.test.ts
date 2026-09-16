import { readFile, rm, stat } from "node:fs/promises";
import { join } from "node:path";
import {
  type AgnosticPaths,
  type PrepareInput,
  type ProcessLogEntry,
  type Repo,
  run,
  setProcessLog,
  type Task,
} from "@agnostic/core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createFolderRepo, createGitRepo, testTask } from "./test-repo.js";
import { createTestTmux, type TestTmux } from "./test-tmux.js";
import { cleanWorktree, prepareWorktree } from "./worktree.js";

let tmux: TestTmux;
let paths: AgnosticPaths;

beforeAll(async () => {
  tmux = await createTestTmux();
  paths = tmux.paths;
});

afterAll(async () => {
  await tmux.cleanup();
});

function prepareInput(repo: Repo, task: Task, overrides: Partial<PrepareInput> = {}): PrepareInput {
  return {
    task,
    repo,
    base: null,
    branch: null,
    branchPrefix: null,
    setupCommand: null,
    logFile: null,
    ...overrides,
  };
}

async function currentBranch(path: string): Promise<string> {
  return (await run("git", ["-C", path, "branch", "--show-current"])).stdout.trim();
}

/** Records every process core's `run`/`spawn` start while `body` runs, so a test can assert none of
 * them was `git`. */
async function processesDuring<T>(body: () => Promise<T>): Promise<{
  result: T;
  entries: ProcessLogEntry[];
}> {
  const entries: ProcessLogEntry[] = [];
  setProcessLog((entry) => entries.push(entry));
  try {
    const result = await body();
    return { result, entries };
  } finally {
    setProcessLog(null);
  }
}

describe("cleanWorktree", () => {
  it("removes the worktree and keeps the branch", async () => {
    const repo = await createGitRepo();
    const task = testTask(repo);
    const prepared = await prepareWorktree(paths, prepareInput(repo, task));
    const cleaned = { ...task, worktreePath: prepared.cwd, branch: prepared.branch };
    await cleanWorktree(paths, { task: cleaned, repo, deleteBranch: false });
    await expect(stat(prepared.cwd)).rejects.toThrowError();
    expect((await run("git", ["-C", repo.path, "worktree", "list"])).stdout).not.toContain(
      prepared.cwd,
    );
    expect((await run("git", ["-C", repo.path, "branch"])).stdout).toContain(prepared.branch ?? "");
  });

  it("deletes the branch when asked, and cleaning twice is not an error", async () => {
    const repo = await createGitRepo();
    const task = testTask(repo);
    const prepared = await prepareWorktree(paths, prepareInput(repo, task));
    const cleaned = { ...task, worktreePath: prepared.cwd, branch: prepared.branch };
    await cleanWorktree(paths, { task: cleaned, repo, deleteBranch: true });
    await cleanWorktree(paths, { task: cleaned, repo, deleteBranch: true });
    expect((await run("git", ["-C", repo.path, "branch"])).stdout).not.toContain(
      prepared.branch ?? "",
    );
  });

  it("prunes and resolves when the directory was removed by hand", async () => {
    const repo = await createGitRepo();
    const task = testTask(repo);
    const prepared = await prepareWorktree(paths, prepareInput(repo, task));
    await rm(prepared.cwd, { recursive: true, force: true });
    await cleanWorktree(paths, {
      task: { ...task, worktreePath: prepared.cwd, branch: prepared.branch },
      repo,
      deleteBranch: false,
    });
    expect((await run("git", ["-C", repo.path, "worktree", "list"])).stdout).not.toContain(
      prepared.cwd,
    );
  });

  it("is a no-op for a folder workspace, with no git call", async () => {
    const repo = await createFolderRepo();
    const { entries } = await processesDuring(() =>
      cleanWorktree(paths, { task: testTask(repo), repo, deleteBranch: true }),
    );
    expect(entries.map((entry) => entry.command)).not.toContain("git");
    await expect(stat(repo.path)).resolves.toBeTruthy();
  });
});

describe("a worktree rebuilt after a clean", () => {
  it("rebuilds a cleaned worktree on the branch the caller names, and sets it up again", async () => {
    const repo = await createGitRepo();
    const task = testTask(repo);
    const logFile = join(paths.logs, "tasks", `${task.id}.log`);
    const setupCommand = "echo installed >> setup-ran.txt";
    const first = await prepareWorktree(paths, prepareInput(repo, task, { setupCommand, logFile }));
    await cleanWorktree(paths, {
      task: { ...task, worktreePath: first.cwd, branch: first.branch },
      repo,
      deleteBranch: false,
    });

    const again = await prepareWorktree(
      paths,
      // The row's branch, not the derived name: a `branch_prefix` changed since the run must not
      // make a second branch of the same work.
      prepareInput(repo, task, {
        branch: first.branch,
        branchPrefix: "feat/",
        setupCommand,
        logFile,
      }),
    );
    expect(again).toEqual({ cwd: first.cwd, branch: first.branch, baseCommit: null });
    expect(await currentBranch(again.cwd)).toBe(first.branch);
    // The dependencies went with the directory, so the setup command runs in the new one.
    expect(await readFile(join(again.cwd, "setup-ran.txt"), "utf8")).toBe("installed\n");
  });

  it("refuses to rebuild when the named branch was deleted, rather than branching from HEAD", async () => {
    const repo = await createGitRepo();
    const task = testTask(repo);
    const prepared = await prepareWorktree(paths, prepareInput(repo, task));
    await cleanWorktree(paths, {
      task: { ...task, worktreePath: prepared.cwd, branch: prepared.branch },
      repo,
      deleteBranch: true,
    });
    await expect(
      prepareWorktree(paths, prepareInput(repo, task, { branch: prepared.branch })),
    ).rejects.toMatchObject({
      code: "worktree-failed",
      message: expect.stringContaining(prepared.branch ?? ""),
    });
    await expect(stat(prepared.cwd)).rejects.toThrowError();
    expect((await run("git", ["-C", repo.path, "branch"])).stdout).not.toContain(
      prepared.branch ?? "",
    );
  });

  it("refuses to rebuild over a worktree of another branch at the same path", async () => {
    const repo = await createGitRepo();
    const task = testTask(repo);
    const prepared = await prepareWorktree(paths, prepareInput(repo, task));
    await expect(
      prepareWorktree(paths, prepareInput(repo, task, { branch: "agn/somewhere-else" })),
    ).rejects.toMatchObject({ code: "worktree-occupied" });
    expect(await currentBranch(prepared.cwd)).toBe(prepared.branch);
  });
});
