import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  type AgnosticPaths,
  agnosticPaths,
  type PrepareInput,
  type ProcessLogEntry,
  type Repo,
  run,
  setProcessLog,
  type Task,
  worktreePath,
} from "@agnostic/core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createFolderRepo, createGitRepo, testTask } from "./test-repo.js";
import { createTestTmux, type TestTmux } from "./test-tmux.js";
import { branchName, cleanWorktree, parseWorktreeList, prepareWorktree } from "./worktree.js";

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

describe("branchName", () => {
  it("slugs the title and keeps the task id", () => {
    const repo = { id: "r7k2m4pqrs", path: "/tmp", kind: "git", name: "x", addedAt: "" } as Repo;
    const task = testTask(repo, { id: "t3n9v2wxyz", title: "Add a --verbose flag to the CLI!" });
    expect(branchName(task)).toBe("agn/add-a-verbose-flag-to-the-cli-t3n9v2wxyz");
  });

  it("cuts a long title at 40 characters and leaves no trailing dash", () => {
    const repo = { id: "r7k2m4pqrs", path: "/tmp", kind: "git", name: "x", addedAt: "" } as Repo;
    const long = testTask(repo, {
      id: "t3n9v2wxyz",
      title: "Rewrite the recommender scoring so that every profile is ranked",
    });
    expect(branchName(long)).toBe("agn/rewrite-the-recommender-scoring-so-that-t3n9v2wxyz");
    expect(branchName(long).split("/")[1]?.length).toBeLessThanOrEqual(40 + "-t3n9v2wxyz".length);
  });

  it("falls back to `task` when nothing survives the slug", () => {
    const repo = { id: "r7k2m4pqrs", path: "/tmp", kind: "git", name: "x", addedAt: "" } as Repo;
    expect(branchName(testTask(repo, { id: "t3n9v2wxyz", title: "!!!" }))).toBe(
      "agn/task-t3n9v2wxyz",
    );
  });

  it("takes the repo's own prefix", () => {
    const repo = { id: "r7k2m4pqrs", path: "/tmp", kind: "git", name: "x", addedAt: "" } as Repo;
    const task = testTask(repo, { id: "t3n9v2wxyz", title: "Fix it" });
    expect(branchName(task, "feat/")).toBe("feat/fix-it-t3n9v2wxyz");
  });
});

describe("parseWorktreeList", () => {
  it("maps each worktree path to its branch, and a detached head to null", () => {
    const porcelain = [
      "worktree /Users/dev/code/agnostic",
      "HEAD abc123",
      "branch refs/heads/main",
      "",
      "worktree /Users/dev/.agnostic/worktrees/r/t",
      "HEAD def456",
      "detached",
      "",
    ].join("\n");
    expect(parseWorktreeList(porcelain)).toEqual(
      new Map([
        ["/Users/dev/code/agnostic", "main"],
        ["/Users/dev/.agnostic/worktrees/r/t", null],
      ]),
    );
  });
});

describe("prepareWorktree", () => {
  it("creates the worktree at the path core names, on the task's branch", async () => {
    const repo = await createGitRepo();
    const task = testTask(repo);
    const prepared = await prepareWorktree(paths, prepareInput(repo, task));
    expect(prepared).toEqual({
      cwd: worktreePath(paths, repo.id, task.id),
      branch: `agn/add-a-verbose-flag-to-the-cli-${task.id}`,
    });
    expect(await currentBranch(prepared.cwd)).toBe(prepared.branch);
    const list = (await run("git", ["-C", repo.path, "worktree", "list"])).stdout;
    expect(list).toContain(prepared.cwd);
  });

  it("is idempotent: a second prepare reuses the worktree it already made", async () => {
    const repo = await createGitRepo();
    const task = testTask(repo);
    const first = await prepareWorktree(paths, prepareInput(repo, task));
    await writeFile(join(first.cwd, "work-in-progress.txt"), "the agent's edit\n");
    const second = await prepareWorktree(paths, prepareInput(repo, task));
    expect(second).toEqual(first);
    expect(await readFile(join(first.cwd, "work-in-progress.txt"), "utf8")).toContain("edit");
  });

  it("branches from a ref when the daemon passes one", async () => {
    const repo = await createGitRepo();
    await run("git", ["-C", repo.path, "checkout", "-q", "-b", "release"]);
    await writeFile(join(repo.path, "release.txt"), "shipped\n");
    await run("git", ["-C", repo.path, "add", "release.txt"]);
    await run("git", [
      "-C",
      repo.path,
      "-c",
      "user.email=t@agn.test",
      "-c",
      "user.name=agn test",
      "commit",
      "-q",
      "-m",
      "release",
    ]);
    await run("git", ["-C", repo.path, "checkout", "-q", "main"]);
    const prepared = await prepareWorktree(
      paths,
      prepareInput(repo, testTask(repo), { base: "release" }),
    );
    await expect(stat(join(prepared.cwd, "release.txt"))).resolves.toBeTruthy();
  });

  it("branches from an explicit commit, not from the working tree", async () => {
    const repo = await createGitRepo();
    const head = (await run("git", ["-C", repo.path, "rev-parse", "HEAD"])).stdout.trim();
    await writeFile(join(repo.path, "uncommitted.txt"), "not yet\n");
    const prepared = await prepareWorktree(
      paths,
      prepareInput(repo, testTask(repo), { base: head }),
    );
    await expect(stat(join(prepared.cwd, "uncommitted.txt"))).rejects.toThrowError();
  });

  it("tells the user to commit first when the repo has none", async () => {
    const repo = await createGitRepo({ commits: false });
    await expect(prepareWorktree(paths, prepareInput(repo, testTask(repo)))).rejects.toMatchObject({
      name: "ExecutorError",
      code: "worktree-failed",
      hint: expect.stringContaining("first commit"),
    });
  });

  it("names the base it could not resolve", async () => {
    const repo = await createGitRepo();
    await expect(
      prepareWorktree(paths, prepareInput(repo, testTask(repo), { base: "no-such-ref" })),
    ).rejects.toMatchObject({
      code: "worktree-failed",
      message: expect.stringContaining("no-such-ref"),
    });
  });

  it("refuses a path that is occupied by something that is not our worktree", async () => {
    const repo = await createGitRepo();
    const task = testTask(repo);
    await mkdir(worktreePath(paths, repo.id, task.id), { recursive: true });
    await expect(prepareWorktree(paths, prepareInput(repo, task))).rejects.toMatchObject({
      code: "worktree-occupied",
    });
  });

  it("runs in place for a folder workspace, with no branch and no git call", async () => {
    const repo = await createFolderRepo();
    const { result: prepared, entries } = await processesDuring(() =>
      prepareWorktree(paths, prepareInput(repo, testTask(repo))),
    );
    expect(prepared).toEqual({ cwd: repo.path, branch: null });
    expect(entries.map((entry) => entry.command)).not.toContain("git");
    await expect(stat(join(repo.path, ".git"))).rejects.toThrowError();
  });
});

describe("setup_command", () => {
  it("runs in the new worktree and writes its output to the task log", async () => {
    const repo = await createGitRepo();
    const task = testTask(repo);
    const logFile = join(paths.logs, "tasks", `${task.id}.log`);
    const prepared = await prepareWorktree(
      paths,
      prepareInput(repo, task, { setupCommand: "pwd && echo installed > deps.txt", logFile }),
    );
    expect(await readFile(join(prepared.cwd, "deps.txt"), "utf8")).toBe("installed\n");
    expect(await readFile(logFile, "utf8")).toContain(prepared.cwd);
  });
});

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

describe("agnosticPaths", () => {
  it("keeps worktrees under the home the executor was built with", () => {
    expect(worktreePath(agnosticPaths("/tmp/home"), "r", "t")).toBe("/tmp/home/worktrees/r/t");
  });
});
