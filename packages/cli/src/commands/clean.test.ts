import type { CleanTaskRequest, Task, TaskListRow, TaskStatus } from "@agnostic/core";
import { DaemonApiError } from "@agnostic/core";
import { describe, expect, it } from "vitest";
import { createTestContext } from "../test-context.js";
import { cleanCommand } from "./clean.js";

function task(id: string, status: TaskStatus, worktreePath: string | null): Task {
  return {
    id,
    repoId: "r7k2m4pqrs",
    title: "add a --verbose flag",
    prompt: "p",
    profileId: "claude-code:default:native",
    worktreePath,
    branch: "agn/flag",
    status,
    origin: "agn",
    baseCommit: null,
    compareId: null,
    createdAt: "2026-09-11T10:00:00.000Z",
    updatedAt: "2026-09-11T10:00:00.000Z",
  };
}

/** The 409 the daemon answers with when a worktree still holds work no commit is keeping. */
function unsaved(id: string, path: string): DaemonApiError {
  return new DaemonApiError(
    `the worktree for task ${id} was not removed: it has uncommitted changes`,
    {
      code: "worktree-unsaved",
      status: 409,
      hint: `Commit or stash in ${path}, or run \`agn clean ${id} --force\` to discard it.`,
    },
  );
}

function cli(tasks: Task[], refuse: string[] = []) {
  const asked: { id: string; body: CleanTaskRequest }[] = [];
  const test = createTestContext({
    client: {
      listAllTasks: () => Promise.resolve({ tasks: tasks.map(listedRow), cursor: 0 }),
      cleanTask: (id, body) => {
        asked.push({ id, body });
        const found = tasks.find((row) => row.id === id) ?? task(id, "done", null);
        if (refuse.includes(id) && body.force !== true) {
          return Promise.reject(unsaved(id, found.worktreePath ?? ""));
        }
        return Promise.resolve({ task: found, removed: found.worktreePath !== null });
      },
    },
  });
  return { ...test, asked };
}

describe("agn clean", () => {
  it("cleans every closed task when given none", async () => {
    const test = cli([task("t3n9v2wxyz", "done", "/w/one"), task("q4m8n2vwxy", "stopped", null)]);
    await cleanCommand(test.ctx).parseAsync([], { from: "user" });
    expect(test.asked.map((call) => call.id)).toEqual(["t3n9v2wxyz", "q4m8n2vwxy"]);
    expect(test.out).toEqual(["cleaned t3n9v2wxyz /w/one", "nothing to clean for q4m8n2vwxy"]);
  });

  it("says so when there is nothing to clean", async () => {
    const test = cli([]);
    await cleanCommand(test.ctx).parseAsync([], { from: "user" });
    expect(test.out).toEqual(["nothing to clean"]);
  });

  it("passes --delete-branch through for the tasks it was given", async () => {
    const test = cli([task("t3n9v2wxyz", "done", "/w/one")]);
    await cleanCommand(test.ctx).parseAsync(["t3n9v2wxyz", "--delete-branch"], { from: "user" });
    expect(test.asked).toEqual([{ id: "t3n9v2wxyz", body: { deleteBranch: true, force: false } }]);
  });

  it("passes --force through", async () => {
    const test = cli([task("t3n9v2wxyz", "done", "/w/one")], ["t3n9v2wxyz"]);
    await cleanCommand(test.ctx).parseAsync(["t3n9v2wxyz", "--force"], { from: "user" });
    expect(test.asked).toEqual([{ id: "t3n9v2wxyz", body: { deleteBranch: false, force: true } }]);
    expect(test.out).toEqual(["cleaned t3n9v2wxyz /w/one"]);
  });

  it("lets a named task's refusal end the command", async () => {
    const test = cli([task("t3n9v2wxyz", "done", "/w/one")], ["t3n9v2wxyz"]);
    await expect(
      cleanCommand(test.ctx).parseAsync(["t3n9v2wxyz"], { from: "user" }),
    ).rejects.toMatchObject({ code: "worktree-unsaved" });
    expect(test.out).toEqual([]);
  });

  it("keeps going past a worktree it may not remove and says how to force it", async () => {
    const test = cli(
      [task("t3n9v2wxyz", "done", "/w/one"), task("q4m8n2vwxy", "done", "/w/two")],
      ["t3n9v2wxyz"],
    );
    await cleanCommand(test.ctx).parseAsync([], { from: "user" });
    expect(test.out).toEqual([
      "kept t3n9v2wxyz /w/one: it has uncommitted changes (agn clean t3n9v2wxyz --force)",
      "cleaned q4m8n2vwxy /w/two",
    ]);
    expect(test.ctx.exitCode).toBe(0);
  });

  it("puts the daemon's error body in the array with --json", async () => {
    const test = cli(
      [task("t3n9v2wxyz", "done", "/w/one"), task("q4m8n2vwxy", "done", "/w/two")],
      ["t3n9v2wxyz"],
    );
    test.ctx.json = true;
    await cleanCommand(test.ctx).parseAsync([], { from: "user" });
    const printed = JSON.parse(test.out.join("\n"));
    expect(printed[0]).toMatchObject({ error: { code: "worktree-unsaved" } });
    expect(printed[0].error.hint).toContain("--force");
    expect(printed[1]).toMatchObject({ task: { id: "q4m8n2vwxy" }, removed: true });
  });

  it("prints an array of the daemon's responses with --json", async () => {
    const test = cli([task("t3n9v2wxyz", "done", "/w/one"), task("q4m8n2vwxy", "stopped", null)]);
    test.ctx.json = true;
    await cleanCommand(test.ctx).parseAsync([], { from: "user" });
    const printed = JSON.parse(test.out.join("\n"));
    expect(Array.isArray(printed)).toBe(true);
    expect(printed).toHaveLength(2);
    expect(printed[0]).toMatchObject({ task: { id: "t3n9v2wxyz" }, removed: true });
    expect(printed[1]).toMatchObject({ task: { id: "q4m8n2vwxy" }, removed: false });
  });
});

/** The list route answers with rows, not bare tasks: the worktree of a seeded task is there. */
function listedRow(task: Task): TaskListRow {
  return { ...task, worktreePresent: task.worktreePath !== null };
}
