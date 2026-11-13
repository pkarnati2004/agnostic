import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { type AskCommitResponse, agPaths, defaultCommitPrompt } from "@agnostic/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTestDaemon, type TestDaemon, waitFor } from "./test-daemon.js";
import { commitLines, gitIn, repoWithConfig, startTask } from "./test-task-run.js";

let daemon: TestDaemon;

beforeEach(async () => {
  daemon = await createTestDaemon({ tmux: true });
});

afterEach(() => daemon.close());

async function asked(id: string): Promise<AskCommitResponse> {
  const response = await daemon.request(`/tasks/${id}/commit`, { method: "POST" });
  expect(response.status).toBe(200);
  return (await response.json()) as AskCommitResponse;
}

async function agentLog(contains: string): Promise<string> {
  await waitFor(
    `the fake agent to log ${contains}`,
    async () => (await daemon.launch?.readLog())?.includes(contains) === true,
  );
  return (await daemon.launch?.readLog()) ?? "";
}

describe("the paths POST /tasks/:id/commit names", () => {
  it("lists staged and unstaged paths and leaves out a committed one", async () => {
    const repo = await repoWithConfig(daemon);
    const task = await startTask(daemon, repo);
    const worktree = task.worktreePath ?? "";
    await commitLines(worktree, 1, "done.txt");
    await writeFile(join(worktree, "staged.txt"), "s\n");
    await gitIn(worktree, ["add", "staged.txt"]);
    await writeFile(join(worktree, "loose.txt"), "l\n");

    const body = await asked(task.id);

    expect(body.prompt).toContain("`loose.txt`");
    expect(body.prompt).toContain("`staged.txt`");
    expect(body.prompt).not.toContain("done.txt");
  });

  it("sends the launch form on a clean tree", async () => {
    const repo = await repoWithConfig(daemon);
    const task = await startTask(daemon, repo);
    const body = await asked(task.id);
    expect(body.prompt).toBe(defaultCommitPrompt(task.branch ?? "", []));
  });

  it("sends the launch form at launch, with no path list in the first prompt", async () => {
    const repo = await repoWithConfig(daemon);
    await startTask(daemon, repo);
    const log = await agentLog("Commit your work on");
    expect(log).not.toContain("Commit the uncommitted changes");
  });

  it("sends the repo's own file verbatim and ignores the dirty paths", async () => {
    const repo = await repoWithConfig(daemon);
    const paths = agPaths(repo.path);
    await mkdir(paths.promptsDir, { recursive: true });
    await writeFile(paths.commitPromptMd, "Run `/land`.\n", "utf8");
    const task = await startTask(daemon, repo);
    await writeFile(join(task.worktreePath ?? "", "dirty.txt"), "d\n");

    const body = await asked(task.id);

    expect(body.prompt).toBe("Run `/land`.");
    expect(body.prompt).not.toContain("dirty.txt");
  });
});
