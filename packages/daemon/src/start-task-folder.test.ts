import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  type Repo,
  run as runProcess,
  type Task,
  type TaskResponse,
  worktreePath,
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

describe("folder workspaces", () => {
  it("runs in place, refuses a second task, and runs in a worktree once git init has happened", async () => {
    const repo = await daemon.addRepo({ git: false, defaultProfile: PROFILE });
    const first = await started(repo, { prompt: "in place please" });
    expect(first.worktreePath).toBeNull();
    expect(first.branch).toBeNull();
    expect(first.session?.cwd).toBe(repo.path);

    const refused = await run(repo, { prompt: "a second one" });
    expect(refused.status).toBe(409);
    expect((await failure(refused)).error.message).toBe(
      "folder workspaces run one task at a time; git init to run tasks in parallel.",
    );

    await daemon.request(`/tasks/${first.id}/stop`, { method: "POST" });
    await gitInit(repo.path);
    const second = await started(repo, { prompt: "now in a worktree" });
    expect(second.worktreePath).toBe(worktreePath(daemon.paths, repo.id, second.id));
    expect(daemon.ledger.repos.get(repo.id)?.kind).toBe("git");
    expect(
      daemon.ledger.events.after(0).filter((event) => event.kind === "repo.updated"),
    ).toHaveLength(1);
  });

  it("guards each folder independently, not every folder repo at once", async () => {
    const first = await daemon.addRepo({ git: false, defaultProfile: PROFILE });
    const second = await daemon.addRepo({ git: false, defaultProfile: PROFILE });

    const busy = await started(first, { prompt: "busy in the first folder" });
    expect(busy.status).toBe("running");

    // The first folder is busy, but the second has never run anything: the guard must not see
    // across repos.
    const other = await started(second, { prompt: "free in the second folder" });
    expect(other.status).toBe("running");

    const refused = await run(first, { prompt: "a second one in the first folder" });
    expect(refused.status).toBe(409);
  });
});

describe("two runs at once on a folder", () => {
  it("starts exactly one of them and refuses the other", async () => {
    const repo = await daemon.addRepo({ git: false, defaultProfile: PROFILE });
    const [first, second] = await Promise.all([
      run(repo, { prompt: "one" }),
      run(repo, { prompt: "two" }),
    ]);
    const statuses = [first?.status, second?.status].sort();
    expect(statuses).toEqual([201, 409]);
    const refused = first?.status === 409 ? first : second;
    expect((await failure(refused as Response)).error.message).toBe(
      "folder workspaces run one task at a time; git init to run tasks in parallel.",
    );
    expect(daemon.ledger.tasks.list({ repoId: repo.id })).toHaveLength(1);
  });
});

async function gitInit(path: string): Promise<void> {
  const git = (args: string[]) =>
    runProcess("git", ["-C", path, "-c", "user.email=t@agn.test", "-c", "user.name=agn", ...args]);
  await git(["init", "-q", "-b", "main"]);
  await writeFile(join(path, "README.md"), "# fixture\n");
  await git(["add", "README.md"]);
  await git(["commit", "-q", "-m", "first"]);
}
