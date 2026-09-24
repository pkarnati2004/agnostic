import { stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  type Repo,
  run as runProcess,
  type Task,
  type TaskResponse,
  writeRepoConfig,
} from "@agnostic/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTestDaemon, type TestDaemon } from "./test-daemon.js";

const PROFILE = "claude-code:default:native";

let daemon: TestDaemon;

beforeEach(async () => {
  daemon = await createTestDaemon({ tmux: true });
});

afterEach(() => daemon.close());

async function run(repo: Repo, body: Record<string, unknown>): Promise<Response> {
  return daemon.request(`/repos/${repo.id}/tasks`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function started(repo: Repo, body: Record<string, unknown>): Promise<Task> {
  const response = await run(repo, body);
  expect(response.status).toBe(201);
  return ((await response.json()) as TaskResponse).task;
}

function failure(response: Response): Promise<{ error: { code: string; message: string } }> {
  return response.json() as Promise<{ error: { code: string; message: string } }>;
}

async function exists(path: string): Promise<boolean> {
  return stat(path).then(
    () => true,
    () => false,
  );
}

function git(cwd: string, args: string[]): Promise<unknown> {
  return runProcess("git", [
    "-C",
    cwd,
    "-c",
    "user.email=t@agn.test",
    "-c",
    "user.name=agn",
    ...args,
  ]);
}

/** A commit only this branch has, so a worktree carrying it proves which ref it was cut from. */
async function commitMarkerFile(cwd: string, name: string): Promise<void> {
  await writeFile(join(cwd, name), "marker\n");
  await git(cwd, ["add", name]);
  await git(cwd, ["commit", "-q", "-m", `add ${name}`]);
}

describe("the --base option", () => {
  it("branches a git ref other than HEAD", async () => {
    const repo = await daemon.addRepo({ defaultProfile: PROFILE });
    await git(repo.path, ["switch", "-c", "feature"]);
    await commitMarkerFile(repo.path, "feature-only.txt");
    await git(repo.path, ["switch", "main"]);

    const task = await started(repo, { prompt: "build on feature", base: "feature" });
    expect(await exists(join(task.worktreePath ?? "", "feature-only.txt"))).toBe(true);
  });

  it("continues from another task's branch when base names a task id", async () => {
    const repo = await daemon.addRepo({ defaultProfile: PROFILE });
    const first = await started(repo, { prompt: "first task" });
    await commitMarkerFile(first.worktreePath ?? "", "from-first-task.txt");

    const second = await started(repo, { prompt: "second task", base: first.id });
    expect(await exists(join(second.worktreePath ?? "", "from-first-task.txt"))).toBe(true);
  });

  it("refuses a base task that never ran in a worktree, and fails the task", async () => {
    const repo = await daemon.addRepo({ git: false, defaultProfile: PROFILE });
    const folderTask = await started(repo, { prompt: "in place, no branch" });

    const gitRepo = await daemon.addRepo({ defaultProfile: PROFILE });
    const response = await run(gitRepo, { prompt: "second task", base: folderTask.id });
    expect(response.status).toBe(400);
    expect((await failure(response)).error.code).toBe("base-invalid");
    const task = daemon.ledger.tasks.list({ repoId: gitRepo.id })[0];
    expect(task?.status).toBe("failed");
  });

  it("uses the repo's base_branch when no --base is given", async () => {
    const repo = await daemon.addRepo({ defaultProfile: PROFILE });
    await git(repo.path, ["switch", "-c", "feature"]);
    await commitMarkerFile(repo.path, "feature-default.txt");
    await git(repo.path, ["switch", "main"]);
    await writeRepoConfig(repo.path, {
      id: repo.id,
      testCommand: null,
      lintCommand: null,
      defaultProfileId: PROFILE,
      baseBranch: "feature",
      branchPrefix: null,
      setupCommand: null,
      cleanAfterMerge: false,
      designFolder: "design",
    });

    const task = await started(repo, { prompt: "no --base here" });
    expect(await exists(join(task.worktreePath ?? "", "feature-default.txt"))).toBe(true);
  });
});
