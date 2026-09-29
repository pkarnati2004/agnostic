import { stat } from "node:fs/promises";
import type {
  ApiErrorBody,
  CompareResponse,
  Event,
  PickCompareResponse,
  Repo,
  StartCompareResponse,
  Task,
} from "@agnostic/core";
import { run } from "@agnostic/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTestDaemon, type TestDaemon } from "../test-daemon.js";
import { closedOutcome, commitLines, repoWithConfig, typeToAgent } from "../test-task-run.js";

let daemon: TestDaemon;
let repo: Repo;

beforeEach(async () => {
  daemon = await createTestDaemon({ tmux: true });
  repo = await repoWithConfig(daemon);
});

afterEach(() => daemon.close());

function startCompare(body: Record<string, unknown>, at: Repo = repo): Promise<Response> {
  return daemon.request(`/repos/${at.id}/compare`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ prompt: "add a --verbose flag", ...body }),
  });
}

async function twoSiblings(): Promise<StartCompareResponse> {
  const response = await startCompare({ profiles: ["claude-code", "codex"] });
  expect(response.status).toBe(201);
  return (await response.json()) as StartCompareResponse;
}

async function read(id: string): Promise<CompareResponse> {
  const response = await daemon.request(`/compares/${id}`);
  expect(response.status).toBe(200);
  return (await response.json()) as CompareResponse;
}

function pick(id: string, taskId: string): Promise<Response> {
  return daemon.request(`/compares/${id}/pick`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ taskId }),
  });
}

async function failure(response: Response): Promise<ApiErrorBody["error"]> {
  return ((await response.json()) as ApiErrorBody).error;
}

async function isDir(path: string | null): Promise<boolean> {
  return stat(path ?? "").then(
    (entry) => entry.isDirectory(),
    () => false,
  );
}

async function branchExists(task: Task): Promise<boolean> {
  const result = await run(
    "git",
    ["-C", repo.path, "rev-parse", "--verify", "--quiet", `refs/heads/${task.branch}`],
    { env: daemon.launch?.env, inheritEnv: false },
  ).catch(() => null);
  return result !== null;
}

describe("POST /repos/:id/compare", () => {
  it("runs one prompt on two agents, a worktree and a branch each", async () => {
    const { compareId, tasks } = await twoSiblings();
    const [first, second] = tasks;

    expect(tasks).toHaveLength(2);
    expect(first?.profileId).toBe("claude-code:default:native");
    expect(second?.profileId).toBe("codex:default:native");
    expect(tasks.map((task) => task.compareId)).toEqual([compareId, compareId]);
    expect(tasks.map((task) => task.status)).toEqual(["running", "running"]);
    expect(first?.worktreePath).not.toBe(second?.worktreePath);
    expect(first?.branch).not.toBe(second?.branch);
    expect(new Set(tasks.map((task) => task.title))).toEqual(new Set(["add a --verbose flag"]));

    // The page learns the group from the feed, so the id rides on `task.created`.
    const created = daemon.ledger.events
      .after(0)
      .filter((event): event is Event<"task.created"> => event.kind === "task.created");
    expect(created.map((event) => event.payload.task.compareId)).toEqual([compareId, compareId]);
  });

  it("refuses fewer than two agents and more than four", async () => {
    expect((await failure(await startCompare({ profiles: ["claude-code"] }))).code).toBe(
      "request-invalid",
    );
    const five = ["claude-code", "codex", "claude-code:opus:native", "codex:gpt-5:native", "pi"];
    expect((await failure(await startCompare({ profiles: five }))).code).toBe("request-invalid");
  });

  it("refuses two names for one profile before anything is started", async () => {
    const response = await startCompare({
      profiles: ["claude-code", "claude-code:default:native"],
    });
    expect(response.status).toBe(400);
    const error = await failure(response);
    expect(error.code).toBe("compare-profiles-duplicate");
    expect(error.message).toContain("claude-code:default:native");
    expect(daemon.ledger.tasks.list()).toEqual([]);
  });

  it("refuses a harness this machine does not have, with nothing started", async () => {
    const response = await startCompare({ profiles: ["claude-code", "pi"] });
    expect(response.status).toBe(400);
    expect((await failure(response)).code).toBe("harness-not-installed");
    expect(daemon.ledger.tasks.list()).toEqual([]);
  });

  it("refuses a folder workspace, which has one working tree to share", async () => {
    const folder = await repoWithConfig(daemon, { git: false });
    const response = await startCompare({ profiles: ["claude-code", "codex"] }, folder);
    expect(response.status).toBe(409);
    const error = await failure(response);
    expect(error.code).toBe("repo-not-git");
    expect(error.message).toContain("one worktree per agent");
    expect(error.hint).toContain("git init");
  });

  it("refuses a closed repo before any agent launches", async () => {
    daemon.ledger.repos.update(repo.id, { status: "archived" });
    const response = await startCompare({ profiles: ["claude-code", "codex"] });
    expect(response.status).toBe(409);
    expect((await failure(response)).code).toBe("repo-closed");
    expect(daemon.ledger.tasks.list()).toEqual([]);
  });
});

describe("GET /compares/:id", () => {
  it("reads the siblings side by side, oldest first", async () => {
    const { compareId, tasks } = await twoSiblings();
    const body = await read(compareId);

    expect(body.repoId).toBe(repo.id);
    expect(body.prompt).toBe("add a --verbose flag");
    expect(body.pickedTaskId).toBeNull();
    expect(body.tasks.map((row) => row.id)).toEqual(tasks.map((task) => task.id));
    expect(body.tasks.map((row) => row.outcome)).toEqual([null, null]);
    expect(body.tasks.map((row) => row.usage.tokens)).toEqual([0, 0]);
    // The fixture detection enumerates the Claude profile and not the built Codex one.
    expect(body.tasks.map((row) => row.billing)).toEqual(["subscription", null]);
    expect(body.tasks.map((row) => row.worktreePresent)).toEqual([true, true]);
    expect(body.tasks.map((row) => row.changes)).toEqual([
      { files: 0, additions: 0, deletions: 0 },
      { files: 0, additions: 0, deletions: 0 },
    ]);

    // What the first agent has committed is counted against the base, for that sibling only.
    await commitLines(tasks[0]?.worktreePath ?? "", 3);
    const after = await read(compareId);
    expect(after.tasks[0]?.changes).toEqual({ files: 1, additions: 3, deletions: 0 });
    expect(after.tasks[1]?.changes).toEqual({ files: 0, additions: 0, deletions: 0 });
  });

  it("answers 404 for an id no task carries", async () => {
    const response = await daemon.request("/compares/zzzzzzzzzz");
    expect(response.status).toBe(404);
    expect((await failure(response)).code).toBe("compare-not-found");
  });

  it("answers 400 for a prefix two compares share", async () => {
    const { tasks } = await twoSiblings();
    for (const [index, id] of ["cmp2aaaaaa", "cmp2bbbbbb"].entries()) {
      daemon.ledger.tasks.insert({
        ...(tasks[0] as Task),
        id: `zzzzzzzzz${index === 0 ? "2" : "3"}`,
        compareId: id,
        worktreePath: null,
        branch: null,
        status: "stopped",
      });
    }
    const response = await daemon.request("/compares/cmp2");
    expect(response.status).toBe(400);
    expect((await failure(response)).code).toBe("ambiguous-id");
  });

  it("reads pickedTaskId null when every sibling finished on its own, with no pick", async () => {
    const { compareId, tasks } = await twoSiblings();
    for (const task of tasks) {
      await typeToAgent(daemon, task, "exit");
    }
    for (const task of tasks) {
      await closedOutcome(daemon, task);
    }

    const body = await read(compareId);
    expect(body.tasks.map((row) => row.status)).toEqual(["done", "done"]);
    // Neither sibling was ever cleaned, so the derivation has nothing to single one out.
    expect(body.pickedTaskId).toBeNull();
  });

  it("reads changes as null once a sibling's branch is gone, not only its worktree", async () => {
    const { compareId, tasks } = await twoSiblings();
    const [kept, loser] = tasks as [Task, Task];
    expect((await pick(compareId, kept.id)).status).toBe(200);
    // The pick already removed the worktree; deleting the branch too leaves git nothing to read.
    await run("git", ["-C", repo.path, "branch", "-D", loser.branch ?? ""], {
      env: daemon.launch?.env,
      inheritEnv: false,
    });

    const body = await read(compareId);
    expect(body.tasks.find((row) => row.id === loser.id)?.changes).toBeNull();
    expect(body.tasks.find((row) => row.id === kept.id)?.changes).not.toBeNull();
  });
});

describe("POST /compares/:id/pick", () => {
  it("keeps one sibling and cleans the rest, branches and all", async () => {
    const { compareId, tasks } = await twoSiblings();
    const [kept, loser] = tasks as [Task, Task];

    const response = await pick(compareId, kept.id.slice(0, 4));
    expect(response.status).toBe(200);
    const body = (await response.json()) as PickCompareResponse;
    expect(body.kept.id).toBe(kept.id);
    expect(body.cleaned.map((task) => task.id)).toEqual([loser.id]);
    expect(body.cleaned[0]?.status).toBe("stopped");

    expect(await isDir(loser.worktreePath)).toBe(false);
    expect(await branchExists(loser)).toBe(true);
    expect(
      daemon.ledger.events.forTask(loser.id).some((event) => event.kind === "task.cleaned"),
    ).toBe(true);

    expect(daemon.ledger.tasks.get(kept.id)?.status).toBe("running");
    expect(await isDir(kept.worktreePath)).toBe(true);
    expect((await read(compareId)).pickedTaskId).toBe(kept.id);
  });

  it("reads the cleaned sibling as reverted once its outcome is written", async () => {
    const { compareId, tasks } = await twoSiblings();
    const [kept, loser] = tasks as [Task, Task];
    expect((await pick(compareId, kept.id)).status).toBe(200);
    await closedOutcome(daemon, loser, "stopped");

    const body = await read(compareId);
    expect(body.tasks[1]?.outcome?.reverted).toBe(true);
  });

  it("does the same thing twice, because a second pick has nothing left to clean", async () => {
    const { compareId, tasks } = await twoSiblings();
    const [kept, loser] = tasks as [Task, Task];
    expect((await pick(compareId, kept.id)).status).toBe(200);

    const response = await pick(compareId, kept.id);
    expect(response.status).toBe(200);
    const body = (await response.json()) as PickCompareResponse;
    expect(body.kept.id).toBe(kept.id);
    expect(body.cleaned.map((task) => task.id)).toEqual([loser.id]);
  });

  it("refuses a task that belongs to another compare", async () => {
    const { compareId, tasks } = await twoSiblings();
    const stranger = daemon.ledger.tasks.insert({
      ...(tasks[0] as Task),
      id: "zzzzzzzzz2",
      compareId: "cmp3nnnnnn",
      worktreePath: null,
      branch: null,
      status: "stopped",
    });

    const response = await pick(compareId, stranger.id);
    expect(response.status).toBe(400);
    const error = await failure(response);
    expect(error.code).toBe("compare-not-sibling");
    expect(error.hint).toContain(tasks[0]?.id ?? "");
  });
});
