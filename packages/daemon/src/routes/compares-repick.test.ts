import { stat } from "node:fs/promises";
import type {
  CompareResponse,
  PickCompareResponse,
  Repo,
  StartCompareResponse,
  Task,
} from "@agnostic/core";
import { run } from "@agnostic/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTestDaemon, type TestDaemon } from "../test-daemon.js";
import { repoWithConfig } from "../test-task-run.js";

/**
 * `compares.test.ts` covers one pick on two siblings. This file covers what builds on that: a
 * pick that names a sibling other than the current winner, and a compare wide enough (four
 * agents) that a pick has more than one loser to clean.
 */

let daemon: TestDaemon;
let repo: Repo;

beforeEach(async () => {
  daemon = await createTestDaemon({ tmux: true });
  repo = await repoWithConfig(daemon);
});

afterEach(() => daemon.close());

function startCompare(profiles: string[]): Promise<Response> {
  return daemon.request(`/repos/${repo.id}/compare`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ prompt: "add a --verbose flag", profiles }),
  });
}

async function twoSiblings(): Promise<StartCompareResponse> {
  const response = await startCompare(["claude-code", "codex"]);
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

describe("a second POST /compares/:id/pick", () => {
  it("naming a different sibling turns the previous winner into a loser", async () => {
    const { compareId, tasks } = await twoSiblings();
    const [a, b] = tasks as [Task, Task];
    expect((await pick(compareId, a.id)).status).toBe(200);

    const response = await pick(compareId, b.id);
    expect(response.status).toBe(200);
    const body = (await response.json()) as PickCompareResponse;
    expect(body.kept.id).toBe(b.id);
    expect(body.cleaned.map((task) => task.id)).toEqual([a.id]);
    expect(body.cleaned[0]?.status).toBe("stopped");
    expect(await isDir(a.worktreePath)).toBe(false);
    expect(await branchExists(a)).toBe(true);

    // The new winner is untouched: agn does not rebuild the worktree it cleaned earlier (ADR 031).
    expect(daemon.ledger.tasks.get(b.id)?.status).toBe("stopped");
    expect(await isDir(daemon.ledger.tasks.get(b.id)?.worktreePath ?? null)).toBe(false);

    // Naming the already-cleaned loser again does not throw and cleans nothing new a third time.
    const again = await pick(compareId, b.id);
    expect(again.status).toBe(200);
    const againBody = (await again.json()) as PickCompareResponse;
    expect(againBody.kept.id).toBe(b.id);
    expect(againBody.cleaned.map((task) => task.id)).toEqual([a.id]);

    // Both worktrees are gone now - a's from this pick, b's from the first one - so nothing on
    // disk singles out a winner and the read says so.
    expect((await read(compareId)).pickedTaskId).toBeNull();

    // Resuming the new winner rebuilds its worktree (ADR 031), and that is what names it again.
    expect((await daemon.request(`/tasks/${b.id}/resume`, { method: "POST" })).status).toBe(200);
    expect(await isDir(daemon.ledger.tasks.get(b.id)?.worktreePath ?? null)).toBe(true);
    expect((await read(compareId)).pickedTaskId).toBe(b.id);
  });
});

describe("a compare with four siblings", () => {
  const FOUR = ["claude-code", "codex", "claude-code:opus:native", "codex:gpt-5:native"];

  async function fourSiblings(): Promise<StartCompareResponse> {
    const response = await startCompare(FOUR);
    expect(response.status).toBe(201);
    return (await response.json()) as StartCompareResponse;
  }

  it("starts one worktree and branch per agent, all under one compare", async () => {
    const { compareId, tasks } = await fourSiblings();

    expect(tasks).toHaveLength(4);
    expect(tasks.map((task) => task.compareId)).toEqual(Array(4).fill(compareId));
    expect(tasks.map((task) => task.profileId)).toEqual([
      "claude-code:default:native",
      "codex:default:native",
      "claude-code:opus:native",
      "codex:gpt-5:native",
    ]);
    expect(tasks.map((task) => task.status)).toEqual(Array(4).fill("running"));
    expect(new Set(tasks.map((task) => task.worktreePath)).size).toBe(4);
    expect(new Set(tasks.map((task) => task.branch)).size).toBe(4);
  });

  it("reads all four side by side, oldest first, before any pick", async () => {
    const { compareId, tasks } = await fourSiblings();
    const body = await read(compareId);

    expect(body.tasks.map((row) => row.id)).toEqual(tasks.map((task) => task.id));
    // Only the fixture's own claude-code profile is detected; the rest are built, native and null.
    expect(body.tasks.map((row) => row.billing)).toEqual(["subscription", null, null, null]);
    expect(body.pickedTaskId).toBeNull();
  });

  it("keeps one and force-cleans the other three, all of them still running", async () => {
    const { compareId, tasks } = await fourSiblings();
    const [kept, ...losers] = tasks as [Task, Task, Task, Task];

    const response = await pick(compareId, kept.id);
    expect(response.status).toBe(200);
    const body = (await response.json()) as PickCompareResponse;
    expect(body.kept.id).toBe(kept.id);
    expect(body.cleaned.map((task) => task.id)).toEqual(losers.map((task) => task.id));
    for (const loser of body.cleaned) {
      expect(loser.status).toBe("stopped");
    }
    for (const loser of losers) {
      expect(await isDir(loser.worktreePath)).toBe(false);
      expect(await branchExists(loser)).toBe(true);
      expect(
        daemon.ledger.events.forTask(loser.id).some((event) => event.kind === "task.cleaned"),
      ).toBe(true);
    }

    expect(daemon.ledger.tasks.get(kept.id)?.status).toBe("running");
    expect(await isDir(kept.worktreePath)).toBe(true);
    expect((await read(compareId)).pickedTaskId).toBe(kept.id);
  });
});
