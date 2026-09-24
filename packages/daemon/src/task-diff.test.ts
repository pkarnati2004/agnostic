import { mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Repo, Task } from "@agnostic/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { DaemonContext } from "./app.js";
import { taskDiff } from "./task-diff.js";
import { createTestDaemon, type TestDaemon } from "./test-daemon.js";
import { repoWithConfig, startTask } from "./test-task-run.js";

let daemon: TestDaemon;
let repo: Repo;
let task: Task;
let ctx: DaemonContext;
let worktree = "";

beforeEach(async () => {
  daemon = await createTestDaemon({ tmux: true });
  repo = await repoWithConfig(daemon);
  task = await startTask(daemon, repo);
  worktree = task.worktreePath ?? "";
  // taskDiff only reads the ledger through ctx, the way task-base.test.ts's ctx does.
  ctx = { ledger: daemon.ledger } as unknown as DaemonContext;
});

afterEach(() => daemon.close());

describe("taskDiff path guard", () => {
  it("refuses a path that climbs out of the directory with ..", async () => {
    await expect(taskDiff(ctx, repo, task, "../outside.txt")).rejects.toMatchObject({
      code: "path-outside-repo",
    });
  });

  it("refuses an absolute path", async () => {
    await expect(taskDiff(ctx, repo, task, "/etc/passwd")).rejects.toMatchObject({
      code: "path-outside-repo",
    });
  });

  it("refuses a symlink that leads outside the repo", async () => {
    const outside = await mkdtemp(join(tmpdir(), "agn-outside-"));
    try {
      await writeFile(join(outside, "secret.txt"), "do not print me\n");
      await symlink(outside, join(worktree, "escape"));
      await expect(taskDiff(ctx, repo, task, "escape/secret.txt")).rejects.toMatchObject({
        code: "path-outside-repo",
      });
    } finally {
      await rm(outside, { recursive: true, force: true });
    }
  });

  it("reads a path with a space in its name", async () => {
    await writeFile(join(worktree, "file with space.txt"), "hello\n");
    const { patch } = await taskDiff(ctx, repo, task, "file with space.txt");
    expect(patch).toContain("+hello");
  });

  it("reads a path with a newline in its name", async () => {
    const name = "weird\nname.txt";
    await writeFile(join(worktree, name), "hello\n");
    const { patch } = await taskDiff(ctx, repo, task, name);
    expect(patch).toContain("+hello");
  });
});

describe("taskDiff untracked files", () => {
  it("returns a long untracked file whole, not tailed", async () => {
    const lines = Array.from({ length: 25 }, (_unused, index) => `line ${index}`);
    await writeFile(join(worktree, "long.txt"), `${lines.join("\n")}\n`);
    const { patch } = await taskDiff(ctx, repo, task, "long.txt");
    for (const line of lines) {
      expect(patch).toContain(`+${line}`);
    }
  });
});
